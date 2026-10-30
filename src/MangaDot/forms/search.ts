/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import {
  AdvancedSearchForm,
  type FlowSectionElement,
  type FormItemElement,
  type FormSectionElement,
  InputRow,
  type ListSectionElement,
  NavigationRow,
  type SearchQuery,
  Section,
  SelectRow,
  SelectSection,
  TriStateSelectRow,
} from "@paperback/types";

import { MangaDot } from "../main";
import {
  ADULT_FILTER,
  CHAPTERS_NUM,
  CONTENT_RATING,
  ORIGIN,
  RATING,
  type SearchMetadata,
  STATUS,
  type TagItem,
  VOLUME,
} from "../models";
import {
  defaultMetadata,
  deNormalizeId,
  generateTagElement,
  getFilters,
  getShowAdultStatus,
  normalizeId,
  TAGS,
} from "../utils";
const PROXY_HANDLERS = {
  handle_: "onHandleDynamicTag",
} as const;

function matchProxyHandler(p: string | symbol) {
  if (typeof p !== "string") return undefined;
  for (const [prefix, method] of Object.entries(PROXY_HANDLERS)) {
    if (p.startsWith(prefix)) return { method, rowId: p.slice(prefix.length) };
  }
  return undefined;
}
class MangaDotAdvancedSearchForm extends AdvancedSearchForm {
  override getSearchQueryMetadata(): SearchMetadata {
    return this.searchMetadata;
  }

  private searchMetadata: SearchMetadata;

  constructor(searchQuery: SearchQuery<SearchMetadata>) {
    super();
    if (searchQuery.metadata !== undefined) {
      this.searchMetadata = searchQuery.metadata;
    } else {
      this.searchMetadata = defaultMetadata();
    }
  }

  override getSections(): FormSectionElement<unknown>[] {
    return [
      Section("genres", this.getGenresFilter()),
      Section("status", this.getStatusFilter()),
      Section("origin", this.getOriginFilter()),
      Section("adult", [
        SelectRow("adultToggle", {
          title: "Show Adult results",
          value: this.searchMetadata.adult ?? getShowAdultStatus(),
          options: ADULT_FILTER,
          minItemCount: 1,
          maxItemCount: 1,
          onValueChange: Application.Selector(this as MangaDotAdvancedSearchForm, "handleAdult"),
        }),
      ]),
      Section("comtent_rating", [
        SelectRow("contentRating", {
          title: "Content Rating",
          value: this.searchMetadata.contentRating ?? ["any"],
          options: CONTENT_RATING,
          minItemCount: 1,
          maxItemCount: 1,
          onValueChange: Application.Selector(
            this as MangaDotAdvancedSearchForm,
            "handleContentRating",
          ),
        }),
      ]),
      Section("rating", [
        SelectRow("Rating", {
          title: "Minimum Rating",
          value: this.searchMetadata.rating ?? ["any"],
          options: RATING,
          minItemCount: 1,
          maxItemCount: 1,
          onValueChange: Application.Selector(this as MangaDotAdvancedSearchForm, "handleRating"),
        }),
      ]),
      Section("language", [
        SelectRow("language", {
          title: "Language",
          value: this.searchMetadata.language ?? [""],
          options: getFilters().language,
          minItemCount: 1,
          maxItemCount: 1,
          onValueChange: Application.Selector(this as MangaDotAdvancedSearchForm, "handleLanguage"),
        }),
      ]),
      Section("volume", [
        SelectRow("volume", {
          title: "Volume",
          value: this.searchMetadata.volume ?? ["any"],
          options: VOLUME,
          minItemCount: 1,
          maxItemCount: 1,
          onValueChange: Application.Selector(
            this as MangaDotAdvancedSearchForm,
            "handleHasVolume",
          ),
        }),
      ]),
      Section("chapters", [
        SelectRow("chapters", {
          title: "Minimum Chapters",
          value: this.searchMetadata.chapters ?? ["any"],
          options: CHAPTERS_NUM,
          minItemCount: 1,
          maxItemCount: 1,
          onValueChange: Application.Selector(
            this as MangaDotAdvancedSearchForm,
            "handleMinChapters",
          ),
        }),
      ]),
      Section("author", [
        NavigationRow("author_filter", {
          title: "Authors",
          subtitle: this.searchMetadata.author?.flatMap(deNormalizeId).join(", ") ?? "",
          form: new AuthorFilter(this.searchMetadata),
        }),
      ]),
      Section("artist", [
        NavigationRow("artist_filter", {
          title: "Artists",
          subtitle: this.searchMetadata.artist?.flatMap(deNormalizeId).join(", ") ?? "",
          form: new ArtistFilter(this.searchMetadata),
        }),
      ]),
    ];
  }

  getGenresFilter(): FormItemElement<unknown>[] {
    return Object.entries(TAGS).map(([categoryName, tags]) => {
      const rowId = categoryName.toLowerCase().replace(/[^a-z0-9]/g, "_");
      const itemsArray = tags.map((tag: TagItem) => ({
        id: normalizeId(tag.name),
        title: tag.name,
      }));
      const rowInitialValue: Record<string, "included" | "excluded"> = {};
      if (this.searchMetadata.tag) {
        for (const tag of tags) {
          if (this.searchMetadata.tag[tag.name]) {
            rowInitialValue[tag.name] = this.searchMetadata.tag[tag.name];
          }
        }
      }
      return TriStateSelectRow(rowId, {
        title: categoryName,
        layout: "list",
        onValueChange: this.proxySel(`handle_${rowId}`),
        items: itemsArray,
        value: rowInitialValue,
        allowEmptySelection: true,
        allowExclusion: true,
        isHidden: false,
      });
    });
  }

  getStatusFilter(): FormItemElement<unknown>[] {
    return [
      SelectRow("status", {
        title: "Status",
        layout: "list",
        onValueChange: Application.Selector(this as MangaDotAdvancedSearchForm, "handleStatus"),
        items: STATUS,
        value:
          this.searchMetadata.status && this.searchMetadata.status.length > 0
            ? this.searchMetadata.status
            : [""],
        minItemCount: 1,
        maxItemCount: 1,
        isHidden: false,
      }),
    ];
  }

  getOriginFilter(): FormItemElement<unknown>[] {
    return [
      SelectRow("origin", {
        title: "Content Type",
        layout: "list",
        onValueChange: Application.Selector(this as MangaDotAdvancedSearchForm, "handleOrigin"),
        items: ORIGIN,
        value:
          this.searchMetadata.origin && this.searchMetadata.origin.length > 0
            ? this.searchMetadata.origin
            : [""],
        minItemCount: 1,
        maxItemCount: ORIGIN.length,
        isHidden: false,
      }),
    ];
  }
  private rowStates: Record<string, Record<string, "included" | "excluded">> = {};

  onValueChangeLabelProxy = new Proxy(this, {
    has(target, p) {
      return matchProxyHandler(p) !== undefined ? true : Object.hasOwn(target, p);
    },
    get(target, p) {
      const handler = matchProxyHandler(p);
      if (handler) {
        const fn = target[handler.method] as (rowId: string, value?: any) => Promise<void>;
        return async (value?: any) => {
          await fn.call(target, handler.rowId, value);
        };
      }
      // @ts-ignore
      return target[p];
    },
  });

  private proxySel(name: string): any {
    // @ts-expect-error dynamic selector
    return Application.Selector(this.onValueChangeLabelProxy, name);
  }

  async onHandleDynamicTag(
    rowId: string,
    value: { [id: string]: "included" | "excluded" },
  ): Promise<void> {
    this.rowStates[rowId] = value;
    const mergedTags: Record<string, "included" | "excluded"> = {};
    for (const rowState of Object.values(this.rowStates)) {
      Object.assign(mergedTags, rowState);
    }
    this.searchMetadata.tag = mergedTags;
  }

  async handleHasVolume(value: string[]): Promise<void> {
    this.searchMetadata.volume = value;
  }

  async handleMinChapters(value: string[]): Promise<void> {
    this.searchMetadata.chapters = value;
  }

  async handleLanguage(value: string[]): Promise<void> {
    this.searchMetadata.language = value;
  }

  async handleRating(value: string[]): Promise<void> {
    this.searchMetadata.rating = value;
  }

  async handleContentRating(value: string[]): Promise<void> {
    this.searchMetadata.contentRating = value;
  }

  async handleAdult(value: string[]): Promise<void> {
    this.searchMetadata.adult = value;
  }

  async handleDemographic(value: { [id: string]: "included" | "excluded" }): Promise<void> {
    this.searchMetadata.demographic = value;
  }

  async handleThemes(value: { [id: string]: "included" | "excluded" }): Promise<void> {
    this.searchMetadata.themes = value;
  }

  async handleMore(value: { [id: string]: "included" | "excluded" }): Promise<void> {
    this.searchMetadata.more = value;
  }

  async handleGenres(value: { [id: string]: "included" | "excluded" }): Promise<void> {
    this.searchMetadata.genres = value;
  }

  async handleStatus(value: string[]): Promise<void> {
    this.searchMetadata.status = value;
  }

  async handleOrigin(value: string[]): Promise<void> {
    const previous = this.searchMetadata?.origin ?? [""];
    const hadAnyBefore = previous.includes("");
    const hasAnyNow = value.includes("");
    if (hadAnyBefore && value.length > 1) {
      value = value.filter((v) => v !== "");
    } else if (!hadAnyBefore && hasAnyNow) {
      value = [""];
    }
    this.searchMetadata.origin = value;
  }
}

class AuthorFilter extends AdvancedSearchForm {
  private authorMetadata: SearchMetadata;

  constructor(authorMetadata: SearchMetadata) {
    super();
    if (authorMetadata !== undefined) {
      this.authorMetadata = authorMetadata;
    } else {
      this.authorMetadata = {
        author: [],
      };
    }
    this.savedAuthorFiltered = this.authorMetadata.author ? this.authorMetadata.author : [];
  }

  override getSearchQueryMetadata(): SearchMetadata {
    if (this.savedAuthorFiltered.length > 0) {
      this.authorMetadata.author = this.savedAuthorFiltered;
    }
    return this.authorMetadata;
  }

  override async formDidSubmit(): Promise<void> {
    if (this.savedAuthorFiltered.length > 0) {
      this.authorMetadata.author = this.savedAuthorFiltered;
    }
  }

  private authorFiltered: string[] = [];
  private savedAuthorFiltered: string[] = [];
  private searchedValue: string = "";

  override getSections(): (ListSectionElement | FlowSectionElement)[] {
    return this.getAuthorFilter();
  }

  getAuthorFilter(): (ListSectionElement | FlowSectionElement)[] {
    return [
      Section("author", [
        InputRow("author", {
          title: "Search Author",
          value: this.searchedValue,
          onValueChange: Application.Selector(this as AuthorFilter, "handleAuthorLabel"),
        }),
      ]),
      ...(this.authorFiltered.length > 0
        ? [
            SelectSection(this, {
              id: "authorSearch",
              layout: "list",
              value: this.savedAuthorFiltered ?? [],
              items: this.authorFiltered.map((elem) => generateTagElement(elem)),
              minItemCount: 0,
              maxItemCount: this.authorFiltered.length,
            }),
          ]
        : []),
      ...(this.savedAuthorFiltered && this.savedAuthorFiltered.length > 0
        ? [
            SelectSection(this, {
              id: "selections",
              layout: "list",
              value: this.savedAuthorFiltered ?? [],
              items: this.savedAuthorFiltered.map((elem) => generateTagElement(elem)),
              minItemCount: 0,
              maxItemCount: this.savedAuthorFiltered.length,
            }),
          ]
        : []),
    ];
  }

  async handleAuthorLabel(value: string): Promise<void> {
    this.searchedValue = value;
    if (value.length > 2) {
      const authors = await MangaDot.api.getAuthor(value);
      this.authorFiltered = authors.suggestions;
    }
  }
}

class ArtistFilter extends AdvancedSearchForm {
  private artistMetadata: SearchMetadata;

  constructor(artistMetadata: SearchMetadata) {
    super();
    if (artistMetadata !== undefined) {
      this.artistMetadata = artistMetadata;
    } else {
      this.artistMetadata = {
        artist: [],
      };
    }
    this.savedArtistFiltered = this.artistMetadata.artist ? this.artistMetadata.artist : [];
  }

  override getSearchQueryMetadata(): SearchMetadata {
    if (this.savedArtistFiltered.length > 0) {
      this.artistMetadata.artist = this.savedArtistFiltered;
    }
    return this.artistMetadata;
  }

  override async formDidSubmit(): Promise<void> {
    if (this.savedArtistFiltered.length > 0) {
      this.artistMetadata.artist = this.savedArtistFiltered;
    }
  }

  private artistsFiltered: string[] = [];
  private savedArtistFiltered: string[] = [];
  private searchedValue: string = "";

  override getSections(): (ListSectionElement | FlowSectionElement)[] {
    return this.getArtistsFilter();
  }

  getArtistsFilter(): (ListSectionElement | FlowSectionElement)[] {
    return [
      Section("artist", [
        InputRow("artist", {
          title: "Search Artist",
          value: this.searchedValue,
          onValueChange: Application.Selector(this as ArtistFilter, "handleArtistLabel"),
        }),
      ]),
      ...(this.artistsFiltered.length > 0
        ? [
            SelectSection(this, {
              id: "artistSearch",
              layout: "list",
              value: this.savedArtistFiltered ?? [],
              items: this.artistsFiltered.map((elem) => generateTagElement(elem)),
              minItemCount: 0,
              maxItemCount: this.artistsFiltered.length,
            }),
          ]
        : []),
      ...(this.savedArtistFiltered && this.savedArtistFiltered.length > 0
        ? [
            SelectSection(this, {
              id: "selections",
              layout: "list",
              value: this.savedArtistFiltered ?? [],
              items: this.savedArtistFiltered.map((elem) => generateTagElement(elem)),
              minItemCount: 0,
              maxItemCount: this.savedArtistFiltered.length,
            }),
          ]
        : []),
    ];
  }

  async handleArtistLabel(value: string): Promise<void> {
    this.searchedValue = value;
    if (value.length > 2) {
      const artists = await MangaDot.api.getArtist(value);
      this.artistsFiltered = artists.suggestions;
    }
  }
}

export default MangaDotAdvancedSearchForm;
