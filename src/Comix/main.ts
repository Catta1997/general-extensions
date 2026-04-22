/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import {
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
  type CloudflareBypassRequestProviding,
  type Cookie,
  CookieStorageInterceptor,
  type DiscoverSection,
  type DiscoverSectionItem,
  type DiscoverSectionProviding,
  DiscoverSectionType,
  type Extension,
  Form,
  type MangaProviding,
  type PagedResults,
  type SearchFilter,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
  type SettingsFormProviding,
  type SortingOption,
  type SourceManga,
} from "@paperback/types";
import { getDiscoverySectionsOrder, MainSettings } from "./forms";
import type { Metadata } from "./models";
import { MainInterceptor, mainRateLimiter } from "./network";
import { JsonParser } from "./parsers";
import { getYearFilterActiveStatus, globalFilters } from "./utils/globalFilters";

type ComixImplementation = SettingsFormProviding &
  Extension &
  DiscoverSectionProviding &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding;
export const parse = new JsonParser();
export const filter = new globalFilters();
export class ComixExtension implements ComixImplementation {
  async getSettingsForm(): Promise<Form> {
    await filter.checkFilters();
    return new MainSettings();
  }

  mainInterceptor = new MainInterceptor("main");
  cookieStorageInterceptor = new CookieStorageInterceptor({
    storage: "stateManager",
  });
  async initialise(): Promise<void> {
    mainRateLimiter.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
    this.mainInterceptor.registerInterceptor();
  }
  async saveCloudflareBypassCookies(cookies: Cookie[]): Promise<void> {
    for (const cookie of cookies) {
      if (cookie.name == "cf_clearance") {
        this.cookieStorageInterceptor.setCookie(cookie);
      }
    }
  }
  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const allSections: Record<string, DiscoverSection> = {
      popular: {
        id: "popular",
        title: "Popular",
        type: DiscoverSectionType.featured,
      },
      follow: {
        id: "follow",
        title: "Most Follows New Comics",
        type: DiscoverSectionType.prominentCarousel,
      },
      recent: {
        id: "recent",
        title: "Recently Added",
        type: DiscoverSectionType.simpleCarousel,
      },
      trending_manga: {
        id: "trending_manga",
        title: `Trending Manga${getYearFilterActiveStatus() ? " of " + filter.getYearSettings() : ""}`,
        type: DiscoverSectionType.simpleCarousel,
      },
      trending_wt: {
        id: "trending_wt",
        title: `Trending WebToons${getYearFilterActiveStatus() ? " of " + filter.getYearSettings() : ""}`,
        type: DiscoverSectionType.simpleCarousel,
      },
      completed: {
        id: "completed",
        title: "Completed",
        type: DiscoverSectionType.simpleCarousel,
      },
      updatesHot: {
        id: "updatesHot",
        title: "Latest Updates (HOT)",
        type: DiscoverSectionType.chapterUpdates,
      },
      updatesNew: {
        id: "updatesNew",
        title: "Latest Updates (NEW)",
        type: DiscoverSectionType.chapterUpdates,
      },
      genres_section: {
        id: "genres_section",
        title: "Best of genres",
        type: DiscoverSectionType.genres,
      },
    };
    return getDiscoverySectionsOrder()
      .map((key) => allSections[key.id])
      .filter(Boolean);
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    switch (section.id) {
      case "popular":
        return await parse.parseSection("popular", undefined);
      case "follow":
        return await parse.parseSection("follow", undefined);
      case "recent":
        return await parse.parseSection("recent", metadata);
      case "trending_manga":
        return await parse.parseSection("trending_manga", metadata);
      case "trending_wt":
        return await parse.parseSection("trending_wt", metadata);
      case "completed":
        return await parse.parseSection("completed", metadata);
      case "updatesNew":
        return await parse.parseSectionChUp("updatesNew", metadata);
      case "updatesHot":
        return await parse.parseSectionChUp("updatesHot", metadata);
      case "genres_section":
        return await parse.parseGenreSection(metadata);
      default:
        return { items: [] };
    }
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    return filter.getFilters();
  }

  getSearchResults(
    query: SearchQuery,
    metadata: Metadata | undefined,
    sortingOption: SortingOption,
  ): Promise<PagedResults<SearchResultItem>> {
    let sorting = sortingOption;
    if (sorting === undefined) {
      sorting = {
        id: "views_30d$desc#empty",
        label: "Any",
      };
    }
    sorting.id = sorting.id.split(query.title.length > 1 ? "#title" : "#empty")[0];
    return parse.parseSearchResults(query, metadata, sorting);
  }
  async getSortingOptions(query: SearchQuery): Promise<SortingOption[]> {
    const idSuffix = query.title.length > 1 ? "#title" : "";
    let sortingOptions: SortingOption[] = [
      { id: "views_30d$desc#empty", label: "Any" },
      { id: "chapter_updated_at$asc" + idSuffix, label: "Update Date ↑" },
      { id: "chapter_updated_at$desc" + idSuffix, label: "Update Date ↓" },
      { id: "created_at$asc" + idSuffix, label: "Created Date ↑" },
      { id: "created_at$desc" + idSuffix, label: "Created Date ↓" },
      { id: "title$asc" + idSuffix, label: "Title ↑" },
      { id: "title$desc" + idSuffix, label: "Title ↓" },
      { id: "year$asc" + idSuffix, label: "Year ↑" },
      { id: "year$desc" + idSuffix, label: "Year ↓" },
      { id: "score$asc" + idSuffix, label: "Average Score ↑" },
      { id: "score$desc" + idSuffix, label: "Average Score ↓" },
      { id: "views_total$asc" + idSuffix, label: "Total Views ↑" },
      { id: "views_totals$desc" + idSuffix, label: "Total Views ↓" },
      { id: "follows_total$asc" + idSuffix, label: "Most Follows ↑" },
      { id: "follows_total$desc" + idSuffix, label: "Most Follows ↓" },
      { id: "views_7d$asc" + idSuffix, label: "Most Views 7 Days ↑" },
      { id: "views_7d$desc" + idSuffix, label: "Most Views 7 Days ↓" },
      { id: "views_30d$asc" + idSuffix, label: "Most Views 1 Month ↑" },
      { id: "views_30d$desc" + idSuffix, label: "Most Views 1 Month ↓" },
      { id: "views_90d$asc" + idSuffix, label: "Most Views 3 Month ↑" },
      { id: "views_90d$desc" + idSuffix, label: "Most Views 3 Month ↓" },
    ];
    if (query.title.length > 1) {
      sortingOptions.unshift({ id: "relevance$desc" + idSuffix, label: "Best Match" });
      sortingOptions = sortingOptions.filter((id) => id.id !== "views_30d$desc#empty");
    }
    return sortingOptions;
  }

  getMangaDetails(mangaId: string): Promise<SourceManga> {
    return parse.parseMangaDetails(mangaId);
  }

  getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    return parse.parseChapters(sourceManga);
  }
  getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    return parse.parseChapterDetails(chapter.chapterId);
  }
}

export const Comix = new ComixExtension();
