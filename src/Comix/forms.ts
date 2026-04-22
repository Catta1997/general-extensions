/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import {
  ButtonRow,
  EditSection,
  Form,
  NavigationRow,
  Section,
  SelectRow,
  type FormSectionElement,
  StepperRow,
  FormConfirmationError,
  LabelRow,
  type FormItemElement,
} from "@paperback/types";
import { filter } from "./main";
import {
  discoverySections,
  getYearFilterActiveStatus,
  getYearTimesChange,
  yearFilter,
} from "./utils/globalFilters";

function getDeletedDiscoverySections() {
  return (
    (Application.getState("deleted_sections") as { id: string; title: string }[] | undefined) ?? []
  );
}

async function setDiscoverySections(newValue: { id: string; title: string }[]) {
  Application.setState(newValue, "sections");
}

async function setDeletedDiscoverySections(newValue: { id: string; title: string }[]) {
  Application.setState(newValue, "deleted_sections");
}

export function getDiscoverySectionsOrder() {
  return (
    (Application.getState("sections") as { id: string; title: string }[] | undefined) ??
    discoverySections
  );
}

abstract class BaseSettings extends Form {
  protected async updateValue<T>(value: T, id: string): Promise<void> {
    Application.setState(value, id);
    Application.invalidateSearchFilters();
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }
}

class EditableListTestForm extends Form {
  override getSections() {
    const onReorderSelectorId = Application.Selector(this as EditableListTestForm, "rowDidReorder");
    const onDeletionSelectorId = Application.Selector(this as EditableListTestForm, "rowDidDelete");

    return [
      {
        ...EditSection("edit", {
          id: "edit",
          footer: "Long press to reorder, swipe to hide",
          items: getDiscoverySectionsOrder().map((item) => this.itemRow(item)),
        }),
        allowDeletion: true,
        allowReorder: true,
        onReorder: onReorderSelectorId,
        onDeletion: onDeletionSelectorId,
      } as unknown as FormSectionElement<unknown>,
      new AddSectionSelect().getDeletedSections(),
      Section("status", [
        ButtonRow("reset", {
          title: "Reset all Sections",
          isHidden: getDeletedDiscoverySections().length == 0,
          onSelect: Application.Selector(this as EditableListTestForm, "resetFiltersDialog"),
        }),
      ]),
    ];
  }
  async resetFiltersDialog() {
    throw new FormConfirmationError(
      Application.Selector(this as EditableListTestForm, "handleLimitStatusChangeReset"),
      "Do you want to restore all deleted sections?",
    );
  }
  async handleLimitStatusChangeReset(): Promise<void> {
    await setDiscoverySections(discoverySections);
    await setDeletedDiscoverySections([]);
    this.reloadForm();
  }
  private itemRow(item: { id: string; title: string }): FormItemElement<unknown> {
    return LabelRow(item.id, {
      title: item.title,
    });
  }

  async rowDidDelete(index: number): Promise<void> {
    const items = getDeletedDiscoverySections();
    const sections = getDiscoverySectionsOrder();
    const deleted = sections.splice(index, 1);
    deleted.forEach((item) => {
      items.push(item);
    });
    await setDeletedDiscoverySections(items);
    await setDiscoverySections(sections);
    this.reloadForm();
  }

  async rowDidReorder(sourceIndex: number, destinationIndex: number): Promise<void> {
    const sections = getDiscoverySectionsOrder();
    const [item] = sections.splice(sourceIndex, 1);
    if (item) {
      sections.splice(destinationIndex, 0, item);
    }
    await setDiscoverySections(sections);
    this.reloadForm();
    Application.invalidateDiscoverSections();
  }
}

class AddSectionSelect {
  onSelectLabelProxy = new Proxy(this, {
    has(target, p) {
      if (typeof p == "string" && p.startsWith("onSelect_")) {
        return true;
      } else {
        return Object.hasOwn(target, p);
      }
    },
    get(target, p) {
      if (typeof p == "string" && p.startsWith("onSelect_")) {
        const rowId = p.slice(9);
        return async () => {
          await target["onSelect"](rowId);
        };
      } else {
        // @ts-ignore
        return target[p];
      }
    },
  });

  deletedForms = getDeletedDiscoverySections();
  getDeletedSections(): FormSectionElement<unknown> {
    return Section(
      { id: "addSectionSelect", footer: "Tap to restore" },
      this.deletedForms.flatMap((item) =>
        LabelRow(item.id, {
          title: item.title,
          // @ts-expect-error
          onSelect: Application.Selector(this.onSelectLabelProxy, "onSelect_" + item.id),
        }),
      ),
    );
  }

  async onSelect(rowId: string): Promise<void> {
    const sections = getDiscoverySectionsOrder();
    const selectedDeletedItems = this.deletedForms.filter((item) => item.id === rowId);
    sections.push(selectedDeletedItems[0]);
    await setDiscoverySections(sections);
    await setDeletedDiscoverySections(this.deletedForms.filter((item) => item.id !== rowId));
    this.deletedForms = getDeletedDiscoverySections();
  }
}

export class MainSettings extends BaseSettings {
  override getSections() {
    return [
      Section("settings", [
        NavigationRow("Contents", {
          title: "Contents",
          subtitle: "Contents Tags Settings",
          form: new FilterSettings(),
        }),
        ButtonRow("reload_genres", {
          title: "Reload all Filters",
          onSelect: Application.Selector(this as MainSettings, "refreshFilters"),
        }),
      ]),
      Section("home_sections", [
        NavigationRow("HomeSections", {
          title: "Home Sections",
          subtitle: "Home Sections Settings",
          form: new SectionSettings(),
        }),
      ]),
    ];
  }
  async refreshFilters() {
    Application.invalidateSearchFilters();
    await filter.updateFilters(true);
    this.reloadForm();
  }
}

class SectionSettings extends BaseSettings {
  override getSections() {
    return [
      Section(
        {
          id: "timeRangeSection",
        },
        [
          SelectRow("timeRange", {
            title: "Time Range",
            subtitle: "Defines the time range for retrieving top-ranked content on Sections",
            value: filter.getLimitSettings(),
            options: this.limitMap,
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as SectionSettings, "handleLimitStatusChange"),
          }),
          ButtonRow("reset_time", {
            title: "Reset to Default Value",
            onSelect: Application.Selector(this as SectionSettings, "resetFiltersDialog"),
          }),
        ],
      ),
      Section(
        {
          id: "yearSettingsSection",
        },
        [
          NavigationRow("Contents", {
            title: "Contents",
            subtitle: "Contents Tags Settings",
            form: new EditableListTestForm(),
          }),
          SelectRow("allTimes", {
            title: "Home Sections Type",
            subtitle: "Choose is sections should use an year or not",
            value: getYearTimesChange(),
            minItemCount: 1,
            maxItemCount: 1,
            options: yearFilter,
            onValueChange: Application.Selector(this as SectionSettings, "handleYearTimesChange"),
          }),
          StepperRow("yearSettings", {
            title: "Year",
            subtitle: "Choose year used on some home section",
            value: filter.getYearSettings(),
            minValue: 2023,
            maxValue: new Date().getFullYear(),
            stepValue: 1,
            loopOver: false,
            onValueChange: Application.Selector(this as SectionSettings, "handleYearStatusChange"),
            isHidden: !getYearFilterActiveStatus(),
          }),
        ],
      ),
    ];
  }
  limitMap = filter.sectionLimit.map(({ value, id }) => ({
    title: value,
    id: id,
  }));
  async handleYearStatusChange(id: number) {
    await this.updateValue(id, "year_settings");
  }
  async handleLimitStatusChange(id: string[]): Promise<void> {
    await this.updateValue(id, "limit");
  }
  async resetFiltersDialog() {
    throw new FormConfirmationError(
      Application.Selector(this as SectionSettings, "handleLimitStatusChangeReset"),
      "Do you want to reset this to the default value?",
    );
  }
  async handleLimitStatusChangeReset(): Promise<void> {
    await this.updateValue(["1"], "limit");
  }
  async handleYearTimesChange(id: string[]): Promise<void> {
    await this.updateValue(id, "yearTimes");
  }
}

class FilterSettings extends BaseSettings {
  genresMap = filter.genres.map(({ value, id }) => ({
    title: value,
    id: id,
  }));

  themesMap = filter.themes.map(({ value, id }) => ({
    title: value,
    id: id,
  }));

  demogMap = filter.demographic.map(({ value, id }) => ({
    title: value,
    id: id,
  }));

  typeMap = filter.contentType.map(({ value, id }) => ({
    title: value,
    id: id,
  }));

  override getSections() {
    return [
      Section(
        {
          id: "update_settings",
          footer: "Tags Settings",
        },
        [
          SelectRow("hide_genres", {
            title: "Hide Genres",
            subtitle: "Hide Some Genre",
            value: filter.getHiddenGenresSettings(),
            options: this.genresMap,
            minItemCount: 0,
            maxItemCount: this.genresMap.length,
            onValueChange: Application.Selector(
              this as FilterSettings,
              "handleHideGenresStatusChange",
            ),
          }),
          SelectRow("hide_theme", {
            title: "Hide Themes",
            subtitle: "Hide Some Theme",
            value: filter.getHiddenThemesSettings(),
            options: this.themesMap,
            minItemCount: 0,
            maxItemCount: this.themesMap.length,
            onValueChange: Application.Selector(
              this as FilterSettings,
              "handleHideThemesStatusChange",
            ),
          }),
          SelectRow("hide_demog", {
            title: "Hide Demographic Type",
            subtitle: "Hide Some Demographic Type",
            value: filter.getHiddenDemogSettings(),
            options: this.demogMap,
            minItemCount: 0,
            maxItemCount: this.demogMap.length,
            onValueChange: Application.Selector(
              this as FilterSettings,
              "handleHideDemogStatusChange",
            ),
          }),
        ],
      ),
      Section(
        {
          id: "type_settings",
          footer: "Type Settings",
        },
        [
          SelectRow("type", {
            title: "Content Type",
            subtitle: "Show Only this type of content",
            value: filter.getShowOnlySettings(),
            options: this.typeMap,
            minItemCount: 0,
            maxItemCount: this.typeMap.length,
            onValueChange: Application.Selector(
              this as FilterSettings,
              "handleShowOnlyStatusChange",
            ),
          }),
        ],
      ),
      Section(
        {
          id: "reset_settings",
          footer: "Reset Settings",
        },
        [
          ButtonRow("reset_genres", {
            title: "Reset all Filters",
            onSelect: Application.Selector(this as FilterSettings, "resetFiltersDialog"),
          }),
        ],
      ),
    ];
  }

  async handleHideGenresStatusChange(id: string[]) {
    await this.updateValue(id, "hide_genres");
  }

  async handleHideThemesStatusChange(id: string[]) {
    await this.updateValue(id, "hide_themes");
  }

  async handleHideDemogStatusChange(id: string[]) {
    await this.updateValue(id, "hide_demog");
  }

  async handleShowOnlyStatusChange(id: string[]) {
    await this.updateValue(id, "show_only");
  }
  async resetFiltersDialog() {
    throw new FormConfirmationError(
      Application.Selector(this as FilterSettings, "resetFilters"),
      "Do you want to reset all values?",
    );
  }
  async resetFilters() {
    await this.updateValue([], "hide_genres");
    await this.updateValue([], "hide_themes");
    await this.updateValue([], "show_only");
    await this.updateValue([], "hide_demog");
  }
}
