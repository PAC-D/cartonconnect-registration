// Shared searchable multi-select used by the registration form and the admin dashboard.
// Markup: <div class="multi-select"> with a .combo-control holding the input, an options panel,
// and a picked-list container. Items are { code, name }.
window.createMultiSelect = function createMultiSelect({ root, input, panel, chips, count, codeLabel, noun, emptyMessage, placeholder, disabledPlaceholder, onChange }) {
  let items = [];
  const selected = new Map();
  const plural = (n) => `${n} ${n === 1 ? noun[0] : noun[1]} selected`;
  const normalise = (value) => String(value || "").toLocaleLowerCase().trim();

  function setOpen(open) {
    panel.hidden = !open;
    input.setAttribute("aria-expanded", String(open));
  }

  const matchesFor = (query) => items.filter((item) => normalise(`${item.name} ${item.code}`).includes(normalise(query)));

  // Name on the left, code on the right in mono, like a shipping mark.
  function itemLabel(item) {
    const name = document.createElement("span");
    name.className = "item-name";
    name.textContent = item.name;
    const code = document.createElement("span");
    code.className = "code";
    code.title = codeLabel;
    code.textContent = item.code;
    return [name, code];
  }

  function render(query = "") {
    panel.replaceChildren();
    const list = document.createElement("div");
    list.className = "options-list";
    list.role = "listbox";
    list.setAttribute("aria-multiselectable", "true");
    const matches = matchesFor(query);
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "empty-option";
      empty.textContent = emptyMessage;
      list.append(empty);
    }
    matches.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.role = "option";
      button.dataset.code = item.code;
      button.setAttribute("aria-selected", String(selected.has(item.code)));
      const check = document.createElement("span");
      check.className = "option-check";
      check.setAttribute("aria-hidden", "true");
      button.append(check, ...itemLabel(item));
      button.addEventListener("click", () => {
        toggle(item);
        panel.querySelector(`[data-code="${CSS.escape(item.code)}"]`)?.focus();
      });
      list.append(button);
    });

    const actions = document.createElement("div");
    actions.className = "options-actions";
    const summary = document.createElement("span");
    summary.textContent = plural(selected.size);
    const allSelected = matches.length > 0 && matches.every((item) => selected.has(item.code));
    const bulk = document.createElement("button");
    bulk.type = "button";
    bulk.className = "text-button";
    bulk.hidden = !matches.length;
    bulk.textContent = allSelected ? (query ? "Clear matches" : "Clear all") : (query ? "Select matches" : "Select all");
    bulk.addEventListener("click", () => {
      matches.forEach((item) => (allSelected ? selected.delete(item.code) : selected.set(item.code, item)));
      changed();
      panel.querySelector(".text-button")?.focus();
    });
    const done = document.createElement("button");
    done.type = "button";
    done.className = "done-button";
    done.textContent = "Done";
    done.addEventListener("click", () => { input.value = ""; setOpen(false); });
    const buttons = document.createElement("span");
    buttons.className = "options-buttons";
    buttons.append(bulk, done);
    actions.append(summary, buttons);
    panel.append(list, actions);
  }

  function renderChips() {
    chips.replaceChildren();
    if (count) count.textContent = selected.size ? `${selected.size} selected` : "";
    selected.forEach((item) => {
      const row = document.createElement("div");
      row.className = "picked-row";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-button";
      remove.setAttribute("aria-label", `Remove ${item.name}`);
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      remove.addEventListener("click", () => toggle(item));
      row.append(...itemLabel(item), remove);
      chips.append(row);
    });
  }

  function changed() {
    render(input.value);
    renderChips();
    onChange?.();
  }

  function toggle(item) {
    if (selected.has(item.code)) selected.delete(item.code);
    else selected.set(item.code, item);
    changed();
  }

  input.addEventListener("focus", () => { if (!input.disabled) { render(input.value); setOpen(true); } });
  input.addEventListener("input", () => { render(input.value); setOpen(true); });
  input.addEventListener("keydown", (event) => { if (event.key === "Escape") setOpen(false); });
  // composedPath is fixed at dispatch, so clicks on options removed by re-render still count as inside.
  document.addEventListener("click", (event) => { if (!event.composedPath().includes(root)) setOpen(false); });

  return {
    // Replace the available items. Selections are cleared unless keep lists the codes to retain.
    setItems(next, keep = []) {
      items = next;
      selected.clear();
      keep.forEach((item) => selected.set(item.code, { code: item.code, name: item.name }));
      input.value = "";
      input.disabled = !items.length;
      input.placeholder = items.length ? placeholder : disabledPlaceholder;
      root.classList.toggle("is-disabled", !items.length);
      setOpen(false);
      renderChips();
    },
    values: () => [...selected.values()].map(({ code, name }) => ({ code, name })),
    size: () => selected.size,
    input
  };
};
