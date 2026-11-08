(() => {
  "use strict";
  const config = window.SUPABASE_CONFIG || {};
  const publishableKey = config.publishableKey || config.anonKey;
  const tokenKey = "cartonconnect_admin_token";
  const token = localStorage.getItem(tokenKey);
  const $ = (selector) => document.querySelector(selector);

  const suppliers = Array.isArray(window.SUPPLIER_FACTORY_DATA) ? window.SUPPLIER_FACTORY_DATA : [];
  const factoryList = Array.isArray(window.FACTORY_LIST) ? window.FACTORY_LIST : [];
  const packagingFactories = window.PACKAGING_FACTORIES || {};
  const suppliersByFactory = new Map();
  suppliers.forEach((supplier) => supplier.factories.forEach((factory) => {
    if (!suppliersByFactory.has(factory.code)) suppliersByFactory.set(factory.code, []);
    suppliersByFactory.get(factory.code).push({ code: supplier.code, name: supplier.name });
  }));
  const factoryByCode = new Map(factoryList.map((factory) => [factory.code, factory]));
  const byName = (a, b) => a.name.localeCompare(b.name);

  // One entry per registration type. "entity" is who registered; "linked" is what they selected.
  // Analytics only count the entity: a factory picked inside a supplier registration is not a registered factory.
  const sections = {
    Supplier: {
      entityLabel: "Supplier", linkedLabel: "Factories", noun: ["supplier", "suppliers"], linkedNoun: ["factory", "factories"],
      universe: suppliers.map(({ code, name }) => ({ code, name })),
      entity: (row) => ({ code: row.supplier_code, name: row.supplier_name }),
      linked: (row) => row.factories || [],
      linkedOptions: (entity) => suppliers.find((item) => item.code === entity.code)?.factories || []
    },
    Factory: {
      entityLabel: "Factory", linkedLabel: "Suppliers", noun: ["factory", "factories"], linkedNoun: ["supplier", "suppliers"],
      universe: factoryList,
      entity: (row) => (row.factories || [])[0] || { code: "", name: "" },
      linked: (row) => row.suppliers || [],
      linkedOptions: (entity) => suppliersByFactory.get(entity.code) || []
    },
    "Packaging supplier": {
      entityLabel: "Packaging supplier", linkedLabel: "Factories", noun: ["packaging supplier", "packaging suppliers"], linkedNoun: ["factory", "factories"],
      universe: Object.keys(packagingFactories).map((name) => ({ code: name, name })),
      entity: (row) => ({ code: row.supplier_name, name: row.supplier_name }),
      linked: (row) => row.factories || [],
      linkedOptions: (entity) => (packagingFactories[entity.code] || []).map((code) => factoryByCode.get(code)).filter(Boolean).sort(byName)
    }
  };

  const shell = $("#dashboard-shell");
  const tableBody = $("#registrations-body");
  const tableMessage = $("#table-message");
  const refreshButton = $("#refresh-button");
  const searchInput = $("#search-input");
  const editDialog = $("#edit-dialog");
  const deleteDialog = $("#delete-dialog");
  const primaryInput = $("#edit-primary-search");
  const primaryPanel = $("#edit-primary-options");
  let registrations = [];
  let activeTab = "Supplier";
  let deleteTarget = null;
  let editTarget = null;
  let editPrimary = null;

  const linkedPicker = createMultiSelect({
    root: $("#edit-linked-multiselect"), input: $("#edit-linked-search"), panel: $("#edit-linked-options"),
    chips: $("#edit-linked-chips"), count: $("#edit-linked-count"), codeLabel: "Code",
    noun: ["item", "items"], emptyMessage: "No options found",
    placeholder: "Search and select", disabledPlaceholder: "Nothing available for this selection"
  });

  async function callRpc(name, payload) {
    if (!config.url || !publishableKey) throw new Error("Supabase is not configured.");
    const response = await fetch(`${config.url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      let message = "The request could not be completed.";
      try { message = (await response.json()).message || message; } catch (_) { /* non-JSON response */ }
      throw new Error(message);
    }
    return response.json();
  }

  function returnToLogin(reason = "") {
    localStorage.removeItem(tokenKey);
    const query = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    window.location.replace(`../admin/${query}`);
  }

  // Portal date format: 07/11/26 16:00
  const formatDate = (value) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)).replace(",", "");
  const withCode = (item) => (item.code && item.code !== item.name ? `${item.name} (${item.code})` : item.name || item.code);
  const names = (items) => (items || []).map((item) => item.name || item.code).filter(Boolean).join(", ");
  const rowsOf = (type) => registrations.filter((row) => row.registration_type === type);

  function analyticsFor(type) {
    const section = sections[type];
    const rows = rowsOf(type);
    const registeredCodes = new Set(rows.map((row) => section.entity(row).code));
    const missing = section.universe.filter((item) => !registeredCodes.has(item.code));
    return {
      rows,
      people: new Set(rows.map((row) => row.email.toLocaleLowerCase())).size,
      registered: section.universe.length - missing.length,
      total: section.universe.length,
      missing
    };
  }

  function appendCell(row, value, className = "") {
    const cell = document.createElement("td");
    cell.textContent = value;
    if (className) cell.className = className;
    row.append(cell);
  }

  function render() {
    const section = sections[activeTab];
    Object.keys(sections).forEach((type) => {
      document.querySelector(`[data-tab-count="${type}"]`).textContent = rowsOf(type).length;
      document.querySelector(`[data-tab="${type}"]`).setAttribute("aria-selected", String(type === activeTab));
    });

    const stats = analyticsFor(activeTab);
    const percent = stats.total ? Math.round((stats.registered / stats.total) * 100) : 0;
    $("#stat-people").textContent = stats.people;
    $("#stat-registered").textContent = `${stats.registered} / ${stats.total}`;
    $("#stat-registered-label").textContent = `${section.noun[1]} registered`;
    $("#stat-missing").textContent = stats.missing.length;
    $("#stat-missing-label").textContent = `${section.noun[1]} not registered`;
    $("#stat-progress").style.width = `${percent}%`;
    $("#stat-percent").textContent = `${percent}%`;
    $("#missing-summary").textContent = `Show ${stats.missing.length} ${section.noun[stats.missing.length === 1 ? 0 : 1]} not registered`;
    $("#missing-items").replaceChildren(...stats.missing.map((item) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = item.name;
      li.append(name);
      if (item.code !== item.name) {
        const code = document.createElement("span");
        code.className = "code";
        code.textContent = item.code;
        li.append(code);
      }
      return li;
    }));

    $("#entity-heading").textContent = section.entityLabel;
    $("#linked-heading").textContent = section.linkedLabel;
    const query = searchInput.value.trim().toLocaleLowerCase();
    const visible = stats.rows.filter((row) => !query ||
      `${row.full_name} ${row.email} ${withCode(section.entity(row))} ${section.linked(row).map(withCode).join(" ")}`.toLocaleLowerCase().includes(query));

    tableBody.replaceChildren();
    visible.forEach((registration) => {
      const row = document.createElement("tr");
      appendCell(row, formatDate(registration.registered_at), "date-cell");
      appendCell(row, registration.full_name);
      appendCell(row, registration.email);
      appendCell(row, withCode(section.entity(registration)));
      appendCell(row, section.linked(registration).map(withCode).join(", ") || "—", "factory-list");
      const actionCell = document.createElement("td");
      const actions = document.createElement("div");
      actions.className = "row-actions";
      [["Edit", "edit"], ["Delete", "delete"]].forEach(([label, action]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `action-button ${action}`;
        button.dataset.action = action;
        button.dataset.id = registration.record_id;
        button.textContent = label;
        actions.append(button);
      });
      actionCell.append(actions);
      row.append(actionCell);
      tableBody.append(row);
    });
    tableMessage.hidden = Boolean(visible.length);
    tableMessage.textContent = stats.rows.length ? "No registrations match your search." : "No registrations in this section yet.";
    $("#total-lines").textContent = `${registrations.length} ${registrations.length === 1 ? "registration" : "registrations"}`;
    $("#table-footnote").textContent = query ? `Showing ${visible.length} of ${stats.rows.length}` : "";
  }

  async function loadRegistrations() {
    refreshButton.disabled = true;
    tableMessage.hidden = false;
    tableMessage.textContent = "Loading registrations...";
    try {
      registrations = await callRpc("get_admin_registrations", { p_token: token });
      render();
    } catch (error) {
      if (/unauthorized|session/i.test(error.message)) returnToLogin("session");
      tableMessage.textContent = error.message;
    } finally {
      refreshButton.disabled = false;
    }
  }

  function exportExcel() {
    if (!window.XLSX) { window.alert("The Excel library is still loading. Please try again in a moment."); return; }
    const workbook = XLSX.utils.book_new();
    const summary = [];
    const missing = [];
    Object.entries(sections).forEach(([type, section]) => {
      const stats = analyticsFor(type);
      summary.push({ Section: type, "People registered": stats.people, Registrations: stats.rows.length,
        Registered: stats.registered, Total: stats.total, "Not registered": stats.missing.length });
      stats.missing.forEach((item) => missing.push({ Type: type, Code: item.code === item.name ? "" : item.code, Name: item.name }));
      const rows = stats.rows.map((row) => ({
        Name: row.full_name,
        Email: row.email,
        [`${section.entityLabel} code`]: section.entity(row).code === section.entity(row).name ? "" : section.entity(row).code,
        [section.entityLabel]: section.entity(row).name,
        [section.linkedLabel]: names(section.linked(row)),
        [`${section.linkedNoun[0].replace(/^./, (c) => c.toUpperCase())} codes`]: section.linked(row).map((item) => item.code).join(", "),
        "Signup time": new Date(row.registered_at)
      }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows, { dateNF: "yyyy-mm-dd hh:mm" }),section.noun[1].replace(/^./, (c) => c.toUpperCase()));
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(missing), "Not registered");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), "Summary");
    XLSX.writeFile(workbook, `cartonconnect-registrations-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // Edit dialog: the primary single-select is the registering entity, the multi-select its linked items.
  function setPrimaryPanel(open) {
    primaryPanel.hidden = !open;
    primaryInput.setAttribute("aria-expanded", String(open));
  }

  function renderPrimaryOptions(query = "") {
    const section = sections[editTarget.registration_type];
    const needle = query.toLocaleLowerCase().trim();
    const matches = section.universe.filter((item) => `${item.name} ${item.code}`.toLocaleLowerCase().includes(needle));
    primaryPanel.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "empty-option";
      empty.textContent = "No matches found";
      primaryPanel.append(empty);
      return;
    }
    matches.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.role = "option";
      button.setAttribute("aria-selected", String(editPrimary?.code === item.code));
      const text = document.createElement("span");
      text.className = "item-name";
      text.textContent = item.name;
      button.append(text);
      if (item.code !== item.name) {
        const code = document.createElement("span");
        code.className = "code";
        code.textContent = item.code;
        button.append(code);
      }
      button.addEventListener("click", () => selectPrimary(item));
      primaryPanel.append(button);
    });
  }

  function selectPrimary(item, keep = []) {
    editPrimary = item;
    primaryInput.value = item.name;
    setPrimaryPanel(false);
    linkedPicker.setItems(sections[editTarget.registration_type].linkedOptions(item), keep);
  }

  function openEdit(registration) {
    const section = sections[registration.registration_type];
    editTarget = registration;
    $("#edit-title").textContent = `Edit ${section.noun[0]} registration`;
    $("#edit-name").value = registration.full_name;
    $("#edit-email").value = registration.email;
    $("#edit-status").textContent = "";
    $("#edit-primary-label").textContent = section.entityLabel;
    $("#edit-linked-label").textContent = section.linkedLabel;
    selectPrimary(section.entity(registration), section.linked(registration));
    editDialog.showModal();
  }

  primaryInput.addEventListener("focus", () => { renderPrimaryOptions(""); setPrimaryPanel(true); });
  primaryInput.addEventListener("input", () => {
    if (editPrimary && primaryInput.value !== editPrimary.name) {
      editPrimary = null;
      linkedPicker.setItems([]);
    }
    renderPrimaryOptions(primaryInput.value);
    setPrimaryPanel(true);
  });
  primaryInput.addEventListener("keydown", (event) => { if (event.key === "Escape") setPrimaryPanel(false); });
  document.addEventListener("click", (event) => { if (!event.target.closest("#edit-primary-combobox")) setPrimaryPanel(false); });

  tableBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const registration = rowsOf(activeTab).find((item) => String(item.record_id) === button.dataset.id);
    if (!registration) return;
    if (button.dataset.action === "edit") openEdit(registration);
    else {
      deleteTarget = registration;
      $("#delete-description").textContent = `Delete the registration for ${registration.full_name}? This cannot be undone.`;
      deleteDialog.showModal();
    }
  });

  $("#edit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = $("#edit-status");
    status.textContent = "";
    const type = editTarget.registration_type;
    const section = sections[type];
    const nameInput = $("#edit-name");
    const emailInput = $("#edit-email");
    if (nameInput.value.trim().length < 2 || !emailInput.checkValidity()) {
      status.textContent = "Enter a valid name and email address.";
      return;
    }
    const linked = linkedPicker.values();
    if (!editPrimary || !linked.length) {
      status.textContent = `Select a ${section.entityLabel.toLocaleLowerCase()} and at least one ${section.linkedNoun[0]}.`;
      return;
    }
    const payload = {
      p_token: token,
      p_registration_type: type,
      p_id: Number(editTarget.record_id),
      p_full_name: nameInput.value.trim(),
      p_email: emailInput.value.trim().toLocaleLowerCase(),
      p_supplier_code: type === "Supplier" ? editPrimary.code : null,
      p_supplier_name: type === "Factory" ? null : editPrimary.name,
      p_factories: type === "Factory" ? [{ code: editPrimary.code, name: editPrimary.name }] : linked,
      p_suppliers: type === "Factory" ? linked : []
    };
    const submitButton = event.currentTarget.querySelector("button[type='submit']");
    submitButton.disabled = true;
    try {
      await callRpc("update_admin_registration", payload);
      editDialog.close();
      await loadRegistrations();
    } catch (error) { status.textContent = error.message; }
    finally { submitButton.disabled = false; }
  });

  $("#delete-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    button.disabled = true;
    try {
      await callRpc("delete_admin_registration", { p_token: token, p_registration_type: deleteTarget.registration_type, p_id: deleteTarget.record_id });
      deleteDialog.close();
      deleteTarget = null;
      await loadRegistrations();
    } catch (error) { window.alert(error.message); }
    finally { button.disabled = false; }
  });

  $("#password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("#new-password");
    const status = $("#password-status");
    status.className = "inline-status";
    if (input.value.length < 8) { status.textContent = "Use at least 8 characters."; return; }
    const button = event.currentTarget.querySelector("button[type='submit']");
    button.disabled = true;
    try {
      await callRpc("change_admin_password", { p_token: token, p_new_password: input.value });
      input.value = "";
      status.classList.add("success");
      status.textContent = "Password updated. Other sessions were signed out.";
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });

  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeDialog}`).close()));
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
    activeTab = button.dataset.tab;
    searchInput.value = "";
    render();
  }));
  $("#settings-button").addEventListener("click", () => { $("#password-status").textContent = ""; $("#settings-dialog").showModal(); });
  $("#export-button").addEventListener("click", exportExcel);
  $("#year").textContent = new Date().getFullYear();
  refreshButton.addEventListener("click", loadRegistrations);
  searchInput.addEventListener("input", render);
  $("#logout-button").addEventListener("click", async () => {
    try { await callRpc("admin_logout", { p_token: token }); } catch (_) { /* clear local session regardless */ }
    returnToLogin();
  });

  if (!token) returnToLogin("session");
  else {
    callRpc("admin_session_valid", { p_token: token }).then((valid) => {
      if (!valid) { returnToLogin("session"); return; }
      $("#auth-check").hidden = true;
      shell.hidden = false;
      loadRegistrations();
    }).catch((error) => {
      const reason = /could not find the function|schema cache|admin_session_valid/i.test(error.message) ? "setup" : "session";
      returnToLogin(reason);
    });
  }
})();
