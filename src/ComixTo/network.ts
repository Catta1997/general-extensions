import {
  BasicRateLimiter,
  PaperbackInterceptor,
  URL,
  type Request,
  type Response,
} from "@paperback/types";
import { filter } from "./main";
import {
  type ApiResponse,
  type ChapterPages,
  type Filters,
  type MangaItem,
  type ResultChapter,
  type ResultFilter,
  type ResultManga,
  type SectionConfig,
  API,
  DOMAIN,
} from "./models";
import { throwCloudflareError } from "./utils";

export class MainInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    return {
      ...request,
      headers: {
        ...request.headers,
        referer: `${DOMAIN}/`,
        "user-agent": await Application.getDefaultUserAgent(),
      },
    };
  }

  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    const cfMitigated = response.headers?.["cf-mitigated"];
    if (cfMitigated === "challenge") {
      await throwCloudflareError();
    }
    return data;
  }
}

export const mainRateLimiter = new BasicRateLimiter("main", {
  numberOfRequests: 5,
  bufferInterval: 1,
  ignoreImages: true,
});

export class ApiMaker {
  apiLink = "";
  private async checkResponseError(request: Request, response: Response): Promise<void> {
    switch (response.status) {
      case 200:
        break;
      case 400:
        throw new Error("400 – Bad Request: The request was invalid", { cause: "Client" });
      case 401:
        throw new Error("401 – Unauthorized: Authentication is required", { cause: "Client" });
      case 404:
        throw new Error(`404 – Not Found: The resource "${response.url}" was not found`, {
          cause: "Client",
        });
      case 408:
        throw new Error("408 – Request Timeout: The server took too long to respond", {
          cause: "Client",
        });
      case 429:
        throw new Error("429 – Too Many Requests: Rate limit exceeded", { cause: "Client" });
      case 500:
        throw new Error("500 – Internal Server Error: A server error occurred", {
          cause: "Server",
        });
      case 502:
        throw new Error("502 – Bad Gateway: Invalid response from upstream server", {
          cause: "Server",
        });
      case 503:
        throw new Error("503 – Service Unavailable: The server is temporarily unavailable", {
          cause: "Server",
        });
      case 504:
        throw new Error("504 – Gateway Timeout: Server response timed out", { cause: "Server" });
      case 403:
        await throwCloudflareError();
        break;
      default:
        throw new Error(`Unexpected HTTP error: ${response.status}`, { cause: "Unknown" });
    }
  }

  private build(section: string, page: number): string {
    const hiddenGenres = [...filter.getHiddenGenresSettings(), ...filter.getHiddenThemesSettings()];
    const types = filter.getShowOnlySettings();
    const days = filter.getLimitSettings()[0];
    const additionalInfo = ["author"];
    const year = filter.getYearSettings();
    const sections: Record<string, SectionConfig> = {
      popular: {
        path: "top",
        query: {
          type: "trending",
          days: days,
          limit: "15",
          "includes[]": additionalInfo,
          ...(types.length > 0 && { "types[]": types }),
          ...(hiddenGenres.length > 0 && { "exclude_genres[]": hiddenGenres }),
        },
      },
      trending_manga: {
        path: "manga",
        query: {
          "order[views_30d]": "desc",
          "types[]": "manga",
          limit: "28",
          "release_year[from]": year.toString(),
          "includes[]": additionalInfo,
          page: page.toString(),
          ...(hiddenGenres.length > 0 && { "exclude_genres[]": hiddenGenres }),
        },
      },
      trending_wt: {
        path: "manga",
        query: {
          "order[views_30d]": "desc",
          "types[]": ["manhwa", "manhua"],
          limit: "28",
          "release_year[from]": year.toString(),
          "includes[]": additionalInfo,
          page: page.toString(),
          ...(hiddenGenres.length > 0 && { "exclude_genres[]": hiddenGenres }),
        },
      },
      follow: {
        path: "top",
        query: {
          type: "follows",
          days: days,
          limit: "50",
          "includes[]": additionalInfo,
          ...(types.length > 0 && { "types[]": types }),
          ...(hiddenGenres.length > 0 && { "exclude_genres[]": hiddenGenres }),
        },
      },
      recent: {
        path: "manga",
        query: {
          "order[created_at]": "desc",
          page: page.toString(),
          limit: "20",
          "includes[]": additionalInfo,
          ...(types.length > 0 && { "types[]": types }),
          ...(hiddenGenres.length > 0 && { "exclude_genres[]": hiddenGenres }),
        },
      },
      completed: {
        path: "manga",
        query: {
          "statuses[]": "finished",
          "order[chapter_updated_at]": "desc",
          page: page.toString(),
          limit: "20",
          ...(types.length > 0 && { "types[]": types }),
          ...(hiddenGenres.length > 0 && { "exclude_genres[]": hiddenGenres }),
        },
      },
      updatesHot: {
        path: "manga",
        query: {
          "order[chapter_updated_at]": "desc",
          page: page.toString(),
          limit: "20",
          scope: "hot",
          ...(types.length > 0 && { "types[]": types }),
          ...(hiddenGenres.length > 0 && { "exclude_genres[]": hiddenGenres }),
        },
      },
      updatesNew: {
        path: "manga",
        query: {
          "order[chapter_updated_at]": "desc",
          page: page.toString(),
          limit: "20",
          scope: "new",
          ...(types.length > 0 && { "types[]": types }),
          ...(hiddenGenres.length > 0 && { "exclude_genres[]": hiddenGenres }),
        },
      },
    };
    const config = sections[section];
    if (!config) throw new Error(`${section} not found on API`);
    const url = new URL(API).addPathComponent(config.path);
    for (const [key, value] of Object.entries(config.query)) {
      url.setQueryItem(key, value);
    }
    return url.toString();
  }

  private JSONParser<T>(html: string) {
    try {
      return JSON.parse(html) as ApiResponse<T>;
    } catch {
      throw new Error("Json parse failed");
    }
  }
  private async getDataFromRequest(): Promise<string> {
    const request = {
      url: this.apiLink,
      method: "GET",
    };
    const [response, data] = await Application.scheduleRequest(request);
    await this.checkResponseError(request, response);
    return Application.arrayBufferToUTF8String(data);
  }

  async getJsonMangaApi(section: string, page: number) {
    this.apiLink = this.build(section, page);
    const html = await this.getDataFromRequest();
    return this.JSONParser<ResultManga>(html);
  }

  async getJsonMangaInfoApi(mangaId: string) {
    const additionalInfo = ["author", "artist", "genre", "theme", "demographic"];
    const url = new URL(API)
      .addPathComponent("manga")
      .addPathComponent(mangaId)
      .setQueryItem("includes[]", additionalInfo);
    this.apiLink = url.toString();
    const html = await this.getDataFromRequest();
    return this.JSONParser<MangaItem>(html);
  }

  async getJsonChapterApi(chapter: string, page: number) {
    const url = new URL(API)
      .addPathComponent("manga")
      .addPathComponent(chapter)
      .addPathComponent("chapters")
      .setQueryItem("page", page.toString())
      .setQueryItem("limit", "100")
      .setQueryItem("order[number]", "desc");
    this.apiLink = url.toString();
    const html = await this.getDataFromRequest();
    return this.JSONParser<ResultChapter>(html);
  }

  async getJsonSearchApi(
    keyword: string,
    page: number,
    filters: Filters[],
    mode: string,
    sortBy: string,
    orderBy: string,
  ) {
    const url = new URL(API).addPathComponent("manga");
    if (keyword.length > 0) url.setQueryItem("keyword", keyword);
    filters.forEach((filter) => {
      url.setQueryItem(filter.type, filter.filters);
    });
    url.setQueryItem("page", page.toString());
    url.setQueryItem(`order[${sortBy}]`, orderBy);
    url.setQueryItem("genres_mode", mode);
    this.apiLink = url.toString();
    const html = await this.getDataFromRequest();
    return this.JSONParser<ResultManga>(html);
  }

  async getJsonChapPagesApi(chapterId: string) {
    const url = new URL(API).addPathComponent("chapters");
    url.addPathComponent(chapterId);
    this.apiLink = url.toString();
    const html = await this.getDataFromRequest();
    return this.JSONParser<ChapterPages>(html);
  }

  async getFiltersApi(filter: string) {
    const url = new URL(API).addPathComponent("terms");
    url.setQueryItem("limit", "100");
    url.setQueryItem("type", filter);
    this.apiLink = url.toString();
    const html = await this.getDataFromRequest();
    return this.JSONParser<ResultFilter>(html);
  }
}
