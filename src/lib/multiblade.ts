// tweakpane-multiselect.ts

import type { Pane, FolderApi } from "tweakpane";

export interface MultiSelectOption {
  value: string;
  label: string;
}

export interface MultiSelectConfig {
  label?: string;
  values?: string[];
  onChange?: (selected: string[]) => void;
  height?: string;
}

export interface CheckboxMultiSelectConfig {
  title?: string;
  expanded?: boolean;
  onChange?: (selected: string[]) => void;
}

export interface SearchableMultiSelectConfig {
  label?: string;
  maxVisible?: number;
  onChange?: (selected: string[]) => void;
}

export interface MultiSelectInstance {
  getSelected(): string[];
  setSelected(values: string[]): void;
  updateOptions(options: (string | MultiSelectOption)[]): void;
  element: HTMLSelectElement;
  destroy(): void;
}

export interface CheckboxMultiSelectInstance {
  getSelected(): string[];
  setSelected(values: string[]): void;
  folder: FolderApi;
  selections: Record<string, boolean>;
}

export interface SearchableMultiSelectInstance {
  getSelected(): string[];
  setSelected(values: string[]): void;
}

/**
 * Creates a native HTML multi-select integrated into TweakPane
 * Perfect for ~10 items with native HTML functionality
 */
export function createMultiSelectBlade(
  pane: Pane | FolderApi,
  options: (string | MultiSelectOption)[],
  config: MultiSelectConfig = {},
  index?: number
): MultiSelectInstance {
  const {
    label = "Multi-Select",
    values = [],
    onChange = () => {},
    height = "120px",
  } = config;

  // Normalize options to have value/label structure
  const normalizedOptions = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt
  );

  // Ensure at least one item is selected - default to first item if none provided
  const initialValues =
    values.length > 0 ? values : [normalizedOptions[0]?.value].filter(Boolean);

  // Create container div
  const container = document.createElement("div");
  container.style.cssText = `
    margin-bottom: 8px;
    padding: 8px;
    background: #2c2c2c;
    border-radius: 4px;
    border: 1px solid #3a3a3a;
  `;

  // Create label
  const labelElement = document.createElement("label");
  labelElement.textContent = label;
  labelElement.style.cssText = `
    color: #ccc;
    font-size: 11px;
    display: block;
    margin-bottom: 4px;
    font-family: Menlo, Monaco, 'Courier New', monospace;
    font-weight: 500;
  `;

  // Create select element
  const selectElement = document.createElement("select");
  selectElement.multiple = true;
  selectElement.style.cssText = `
    width: 100%;
    background: #3a3a3a;
    color: #fff;
    border: 1px solid #555;
    border-radius: 3px;
    min-height: ${height};
    padding: 4px;
    font-family: Menlo, Monaco, 'Courier New', monospace;
    font-size: 11px;
    outline: none;
    transition: border-color 0.2s;
  `;

  // Populate options
  normalizedOptions.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    option.style.cssText = `
      padding: 4px 8px;
      background: #3a3a3a;
      color: #fff;
    `;
    selectElement.appendChild(option);
  });

  // Create help text
  const helpText = document.createElement("div");
  helpText.textContent = "Hold Ctrl/Cmd to select multiple";
  helpText.style.cssText = `
    color: #888;
    font-size: 10px;
    margin-top: 2px;
    font-family: Menlo, Monaco, 'Courier New', monospace;
  `;

  // Function to update visual selection state
  function updateVisualSelection() {
    Array.from(selectElement.options).forEach((option) => {
      if (option.selected) {
        option.style.cssText = `
          padding: 4px 8px;
          background: #0f92ff !important;
          color: #fff !important;
        `;
      } else {
        option.style.cssText = `
          padding: 4px 8px;
          background: #3a3a3a;
          color: #fff;
        `;
      }
    });
  }

  // Assemble container
  container.appendChild(labelElement);
  container.appendChild(selectElement);
  container.appendChild(helpText);

  // Add focus/blur styling
  selectElement.addEventListener("focus", () => {
    selectElement.style.borderColor = "#0f92ff";
    selectElement.style.boxShadow = "0 0 0 2px rgba(15, 146, 255, 0.2)";
  });

  selectElement.addEventListener("blur", () => {
    selectElement.style.borderColor = "#555";
    selectElement.style.boxShadow = "none";
  });

  // Set initial values
  if (initialValues.length > 0) {
    Array.from(selectElement.options).forEach((option) => {
      option.selected = initialValues.includes(option.value);
    });
  }

  // Initial visual update
  updateVisualSelection();

  // Trigger initial onChange to sync with TweakPane state
  if (initialValues.length > 0) {
    onChange(initialValues);
  }

  // Add change listener with validation
  selectElement.addEventListener("change", (e) => {
    const target = e.target as HTMLSelectElement;
    const selected = Array.from(target.selectedOptions).map((opt) => opt.value);

    // Ensure at least one item is always selected
    if (selected.length === 0 && normalizedOptions.length > 0) {
      // Select the first option if nothing is selected
      target.options[0].selected = true;
      const correctedSelected = [target.options[0].value];
      updateVisualSelection();
      onChange(correctedSelected);
    } else {
      updateVisualSelection();
      onChange(selected);
    }
  });

  // Add to TweakPane using a separator (which allows custom HTML)
  const separator = index
    ? pane.children[index]
    : pane.addBlade({ view: "separator" });

  const separatorElement = separator.element;

  // Replace separator content with our custom element
  separatorElement.innerHTML = "";
  separatorElement.appendChild(container);
  separatorElement.style.padding = "0";
  separatorElement.style.margin = "4px 0";

  // Return object with utility methods
  return {
    getSelected(): string[] {
      return Array.from(selectElement.selectedOptions).map((opt) => opt.value);
    },

    setSelected(newValues: string[]): void {
      // Ensure at least one value is selected
      const valuesToSet =
        newValues.length > 0
          ? newValues
          : [normalizedOptions[0]?.value].filter(Boolean);

      Array.from(selectElement.options).forEach((option) => {
        option.selected = valuesToSet.includes(option.value);
      });
      updateVisualSelection();
      // Trigger onChange to sync state, but avoid triggering the HTML change event to prevent loops
      onChange(valuesToSet);
    },

    updateOptions(newOptions: (string | MultiSelectOption)[]): void {
      const normalized = newOptions.map((opt) =>
        typeof opt === "string" ? { value: opt, label: opt } : opt
      );

      selectElement.innerHTML = "";
      normalized.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        option.style.cssText = `
          padding: 4px 8px;
          background: #3a3a3a;
          color: #fff;
        `;
        selectElement.appendChild(option);
      });

      // Ensure at least the first option is selected after updating
      if (normalized.length > 0) {
        selectElement.options[0].selected = true;
        updateVisualSelection();
        // Trigger onChange to sync state
        onChange([selectElement.options[0].value]);
      }
    },

    element: selectElement,

    destroy(): void {
      pane.remove(separator);
    },
  };
}

/**
 * Creates a checkbox-based multi-select using TweakPane folders
 * Good for when you prefer checkbox UI
 */
export function createCheckboxMultiSelect(
  pane: Pane | FolderApi,
  options: (string | MultiSelectOption)[],
  config: CheckboxMultiSelectConfig = {}
): CheckboxMultiSelectInstance {
  const {
    title = "Multi-Select",
    expanded = false,
    onChange = () => {},
  } = config;

  // Normalize options
  const normalizedOptions = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt
  );

  const selections: Record<string, boolean> = {};
  normalizedOptions.forEach((opt) => {
    selections[opt.value] = false;
  });

  const folder = pane.addFolder({
    title: `${title} (0/${normalizedOptions.length})`,
    expanded,
  });

  const bindings: any[] = [];

  // Add checkbox for each option
  normalizedOptions.forEach((opt) => {
    const binding = folder.addBinding(selections, opt.value, {
      label: opt.label,
    });

    binding.on("change", updateSelection);
    bindings.push(binding);
  });

  function updateSelection(): void {
    const selected = Object.entries(selections)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .filter(([_, value]) => value)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(([key, _]) => key);

    // Update folder title with count
    folder.title = `${title} (${selected.length}/${normalizedOptions.length})`;

    onChange(selected);
  }

  return {
    getSelected(): string[] {
      return (
        Object.entries(selections)
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          .filter(([_, value]) => value)
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          .map(([key, _]) => key)
      );
    },

    setSelected(values: string[]): void {
      Object.keys(selections).forEach((key) => {
        selections[key] = values.includes(key);
      });
      // Refresh all bindings
      bindings.forEach((binding) => binding.refresh());
      updateSelection();
    },

    folder,
    selections,
  };
}

/**
 * Creates a searchable multi-select with filtering
 * Perfect for larger lists (50+ items)
 */
export function createSearchableMultiSelect(
  pane: Pane | FolderApi,
  allOptions: (string | MultiSelectOption)[],
  config: SearchableMultiSelectConfig = {}
): SearchableMultiSelectInstance {
  const {
    label = "Searchable Multi-Select",
    maxVisible = 8,
    onChange = () => {},
  } = config;

  // Normalize options
  const normalizedOptions = allOptions.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt
  );

  const state = {
    search: "",
    selected: "",
  };

  const folder = pane.addFolder({
    title: label,
    expanded: true,
  });

  // Search input
  const searchBinding = folder.addBinding(state, "search", {
    label: "Search",
  });

  // Selected items display
  const selectedBinding = folder.addBinding(state, "selected", {
    label: "Selected",
    readonly: true,
    multiline: true,
    rows: 3,
  });

  let currentButtons: any[] = [];
  const selected = new Set<string>();

  function updateResults(): void {
    const query = state.search.toLowerCase();
    const filtered = query
      ? normalizedOptions
          .filter((opt) => opt.label.toLowerCase().includes(query))
          .slice(0, maxVisible)
      : normalizedOptions.slice(0, maxVisible);

    // Remove old buttons
    currentButtons.forEach((btn) => folder.remove(btn));
    currentButtons = [];

    // Add buttons for filtered results
    filtered.forEach((opt) => {
      const isSelected = selected.has(opt.value);

      const btn = folder.addButton({
        title: isSelected ? `✓ ${opt.label}` : `+ ${opt.label}`,
      });

      btn.on("click", () => {
        if (selected.has(opt.value)) {
          selected.delete(opt.value);
        } else {
          selected.add(opt.value);
        }
        updateDisplay();
        updateResults(); // Refresh button states
      });

      currentButtons.push(btn);
    });
  }

  function updateDisplay(): void {
    const selectedArray = Array.from(selected);
    const selectedLabels = selectedArray.map((value) => {
      const option = normalizedOptions.find((opt) => opt.value === value);
      return option ? option.label : value;
    });

    state.selected =
      selectedLabels.length > 0 ? selectedLabels.join("\n") : "None selected";

    selectedBinding.refresh();
    onChange(selectedArray);
  }

  searchBinding.on("change", updateResults);

  // Initialize
  updateResults();
  updateDisplay();

  return {
    getSelected(): string[] {
      return Array.from(selected);
    },

    setSelected(values: string[]): void {
      selected.clear();
      values.forEach((value) => selected.add(value));
      updateDisplay();
      updateResults();
    },
  };
}
