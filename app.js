(() => {
  "use strict";

  const suppliers = Array.isArray(window.SUPPLIER_FACTORY_DATA) ? window.SUPPLIER_FACTORY_DATA : [];
  const factoryList = Array.isArray(window.FACTORY_LIST) ? window.FACTORY_LIST : [];
  const packagingFactories = window.PACKAGING_FACTORIES || {};

  // Every packaging-assigned factory, with the garment suppliers allocated to it (may be none).
  const suppliersByFactory = new Map();
  suppliers.forEach((supplier) => supplier.factories.forEach((factory) => {
    if (!suppliersByFactory.has(factory.code)) suppliersByFactory.set(factory.code, []);
    suppliersByFactory.get(factory.code).push({ code: supplier.code, name: supplier.name });
  }));
  const factories = factoryList.map((factory) => ({ ...factory, suppliers: suppliersByFactory.get(factory.code) || [] }));
  const factoryByCode = new Map(factories.map((factory) => [factory.code, factory]));

  const $ = (selector) => document.querySelector(selector);
  const state = { supplier: null, registrationFactory: null };

  const form = $("#registration-form");
  const supplierInput = $("#supplier-search");
  const supplierPanel = $("#supplier-options");
  const clearSupplierButton = $("#clear-supplier");
  const fullName = $("#full-name");
  const email = $("#email");
  const status = $("#form-status");

  const factoryForm = $("#factory-registration-form");
  const registrationFactoryInput = $("#factory-registration-search");
  const registrationFactoryPanel = $("#factory-registration-options");
  const clearRegistrationFactoryButton = $("#clear-registration-factory");
  const noSuppliersNote = $("#no-suppliers-note");
  const factoryName = $("#factory-name");
  const factoryEmail = $("#factory-email");
  const factoryStatus = $("#factory-form-status");

  const packagingForm = $("#packaging-registration-form");
  const packagingSupplier = $("#packaging-supplier");
  const packagingName = $("#packaging-name");
  const packagingEmail = $("#packaging-email");
  const packagingStatus = $("#packaging-form-status");

  const typeRadios = [...document.querySelectorAll('input[name="registration-type"]')];
  const typeHint = $("#type-hint");
  const steps = [...document.querySelectorAll(".steps li")];

  $("#year").textContent = new Date().getFullYear();

  const factoryPicker = createMultiSelect({
    root: $("#factory-multiselect"), input: $("#factory-search"), panel: $("#factory-options"),
    chips: $("#selected-factories"), count: $("#factory-count"), codeLabel: "Factory code",
    noun: ["factory", "factories"], emptyMessage: "No assigned factories found",
    placeholder: "Search factories", disabledPlaceholder: "Select a supplier first",
    onChange: () => setFieldError($("#factory-search"), "factory-error", "")
  });
  const allocatedSupplierPicker = createMultiSelect({
    root: $("#allocated-supplier-multiselect"), input: $("#allocated-supplier-search"), panel: $("#allocated-supplier-options"),
    chips: $("#selected-suppliers"), count: $("#allocated-supplier-count"), codeLabel: "Supplier code",
    noun: ["supplier", "suppliers"], emptyMessage: "No allocated suppliers found",
    placeholder: "Search suppliers", disabledPlaceholder: "Select a factory first",
    onChange: () => setFieldError($("#allocated-supplier-search"), "allocated-supplier-error", "")
  });
  const packagingFactoryPicker = createMultiSelect({
    root: $("#packaging-factory-multiselect"), input: $("#packaging-factory-search"), panel: $("#packaging-factory-options"),
    chips: $("#packaging-selected-factories"), count: $("#packaging-factory-count"), codeLabel: "Factory code",
    noun: ["factory", "factories"], emptyMessage: "No assigned factories found",
    placeholder: "Search factories", disabledPlaceholder: "Select a packaging supplier first",
    onChange: () => setFieldError($("#packaging-factory-search"), "packaging-factory-error", "")
  });

  const normalise = (value) => value.toLocaleLowerCase().trim();
  const includesQuery = (item, query) => normalise(`${item.name} ${item.code}`).includes(normalise(query));

  // An empty message clears the error.
  function setFieldError(input, errorId, message) {
    $(`#${errorId}`).textContent = message;
    (input.closest(".combo-control") || input).classList.toggle("has-error", Boolean(message));
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function setPanel(input, panel, open) {
    panel.hidden = !open;
    input.setAttribute("aria-expanded", String(open));
  }

  function renderSingleSelect(panel, items, query, selectedCode, emptyMessage, codeLabel, onSelect) {
    panel.replaceChildren();
    const matches = items.filter((item) => includesQuery(item, query));
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "empty-option";
      empty.textContent = emptyMessage;
      panel.append(empty);
      return;
    }
    matches.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.role = "option";
      button.setAttribute("aria-selected", String(selectedCode === item.code));
      const text = document.createElement("span");
      text.className = "item-name";
      text.textContent = item.name;
      const code = document.createElement("span");
      code.className = "code";
      code.title = codeLabel;
      code.textContent = item.code;
      button.append(text, code);
      button.addEventListener("click", () => onSelect(item));
      panel.append(button);
    });
  }

  // Supplier registration: one supplier, many of its factories.
  function renderSuppliers(query = "") {
    renderSingleSelect(supplierPanel, suppliers, query, state.supplier?.code, "No suppliers found", "Supplier code", selectSupplier);
  }

  function selectSupplier(supplier) {
    const changed = state.supplier?.code !== supplier.code;
    state.supplier = supplier;
    supplierInput.value = supplier.name;
    clearSupplierButton.hidden = false;
    setPanel(supplierInput, supplierPanel, false);
    setFieldError(supplierInput, "supplier-error", "");
    if (changed) factoryPicker.setItems(supplier.factories);
  }

  function clearSupplier(focus = true) {
    state.supplier = null;
    supplierInput.value = "";
    clearSupplierButton.hidden = true;
    setPanel(supplierInput, supplierPanel, false);
    factoryPicker.setItems([]);
    if (focus) supplierInput.focus();
  }

  // Factory registration: one factory, many of its allocated suppliers.
  function renderRegistrationFactories(query = "") {
    renderSingleSelect(registrationFactoryPanel, factories, query, state.registrationFactory?.code,
      "No factories found", "Factory code", selectRegistrationFactory);
  }

  function selectRegistrationFactory(factory) {
    const changed = state.registrationFactory?.code !== factory.code;
    state.registrationFactory = factory;
    registrationFactoryInput.value = factory.name;
    clearRegistrationFactoryButton.hidden = false;
    setPanel(registrationFactoryInput, registrationFactoryPanel, false);
    setFieldError(registrationFactoryInput, "factory-registration-error", "");
    noSuppliersNote.hidden = factory.suppliers.length > 0;
    if (changed) allocatedSupplierPicker.setItems(factory.suppliers);
    if (!factory.suppliers.length) allocatedSupplierPicker.input.placeholder = "No assigned suppliers";
  }

  function clearRegistrationFactory(focus = true) {
    state.registrationFactory = null;
    registrationFactoryInput.value = "";
    clearRegistrationFactoryButton.hidden = true;
    noSuppliersNote.hidden = true;
    setPanel(registrationFactoryInput, registrationFactoryPanel, false);
    allocatedSupplierPicker.setItems([]);
    if (focus) registrationFactoryInput.focus();
  }

  function validEmail(input) {
    return Boolean(input.value.trim()) && input.checkValidity();
  }

  function validate() {
    let valid = true;
    const check = (input, errorId, ok, message) => {
      setFieldError(input, errorId, ok ? "" : message);
      if (!ok) valid = false;
    };
    check(supplierInput, "supplier-error", state.supplier, "Please select a supplier.");
    check($("#factory-search"), "factory-error", factoryPicker.size(), "Select at least one factory.");
    check(fullName, "name-error", fullName.value.trim().length >= 2, "Please enter your full name.");
    check(email, "email-error", validEmail(email), "Enter a valid email address.");
    return valid;
  }

  function validateFactoryForm() {
    let valid = true;
    const check = (input, errorId, ok, message) => {
      setFieldError(input, errorId, ok ? "" : message);
      if (!ok) valid = false;
    };
    check(registrationFactoryInput, "factory-registration-error", state.registrationFactory, "Please select a factory.");
    if (state.registrationFactory && !state.registrationFactory.suppliers.length) {
      valid = false; // the no-suppliers note already explains what to do
    } else {
      check($("#allocated-supplier-search"), "allocated-supplier-error", allocatedSupplierPicker.size(), "Select at least one supplier.");
    }
    check(factoryName, "factory-name-error", factoryName.value.trim().length >= 2, "Please enter your full name.");
    check(factoryEmail, "factory-email-error", validEmail(factoryEmail), "Enter a valid email address.");
    return valid;
  }

  function validatePackagingForm() {
    let valid = true;
    const check = (input, errorId, ok, message) => {
      setFieldError(input, errorId, ok ? "" : message);
      if (!ok) valid = false;
    };
    check(packagingSupplier, "packaging-supplier-error", packagingSupplier.value, "Please select a packaging supplier.");
    check($("#packaging-factory-search"), "packaging-factory-error", packagingFactoryPicker.size(), "Select at least one factory.");
    check(packagingName, "packaging-name-error", packagingName.value.trim().length >= 2, "Please enter your full name.");
    check(packagingEmail, "packaging-email-error", validEmail(packagingEmail), "Enter a valid email address.");
    return valid;
  }

  async function saveRegistration(payload, table = "registrations") {
    const config = window.SUPABASE_CONFIG || {};
    const publishableKey = config.publishableKey || config.anonKey;
    if (!config.url || !publishableKey) {
      console.info("Supabase is not configured. Validated registration:", payload);
      return { demo: true };
    }

    const response = await fetch(`${config.url.replace(/\/$/, "")}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let detail = "The registration could not be saved.";
      try {
        const body = await response.json();
        detail = body.code === "23505" ? "This email is already registered for that selection." : body.message || detail;
      } catch (_) { /* non-JSON error */ }
      throw new Error(detail);
    }
    return { demo: false };
  }

  function showTypeSelection() {
    $("#type-section").scrollIntoView({ behavior: "smooth", block: "start" });
    (typeRadios.find((radio) => radio.checked) || typeRadios[0]).focus({ preventScroll: true });
  }

  const activeType = () => typeRadios.find((radio) => radio.checked)?.value;
  const typeLabels = { supplier: "Supplier", factory: "Factory", packaging: "Packaging supplier" };
  const allocationLabels = { supplier: "Supplier and its factories", factory: "Factory and its suppliers", packaging: "Packaging supplier and its factories" };

  function selectRegistrationType(type) {
    form.hidden = type !== "supplier";
    factoryForm.hidden = type !== "factory";
    packagingForm.hidden = type !== "packaging";
    typeHint.hidden = true;
    [status, factoryStatus, packagingStatus].forEach((target) => { target.hidden = true; target.className = "form-status"; });
    $("#step-type-detail").textContent = typeLabels[type];
    $("#step-allocations-detail").textContent = allocationLabels[type];
    updateProgress();
  }

  // Left-rail steps: done when that part of the active form is complete; the first open one is current.
  function updateProgress() {
    const type = activeType();
    const details = { supplier: [fullName, email], factory: [factoryName, factoryEmail], packaging: [packagingName, packagingEmail] }[type];
    const done = {
      type: Boolean(type),
      allocations: type === "supplier" ? Boolean(state.supplier && factoryPicker.size())
        : type === "factory" ? Boolean(state.registrationFactory && allocatedSupplierPicker.size())
        : type === "packaging" ? Boolean(packagingSupplier.value && packagingFactoryPicker.size()) : false,
      details: Boolean(details && details[0].value.trim().length >= 2 && validEmail(details[1]))
    };
    let currentSet = false;
    steps.forEach((step) => {
      const isDone = done[step.dataset.step];
      const isCurrent = !isDone && !currentSet;
      if (isCurrent) currentSet = true;
      step.classList.toggle("is-done", isDone);
      step.classList.toggle("is-current", isCurrent);
      if (isCurrent) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
    });
  }

  function showSuccess(target, message) {
    const text = document.createElement("span");
    text.textContent = message;
    const returnButton = document.createElement("button");
    returnButton.type = "button";
    returnButton.className = "selection-return";
    returnButton.textContent = "Register another";
    returnButton.addEventListener("click", showTypeSelection);
    target.replaceChildren(text, document.createElement("br"), returnButton);
    target.className = "form-status success";
    target.hidden = false;
  }

  // Shared submit flow for all three forms.
  function handleSubmit(targetForm, targetStatus, validator, buildPayload, table, successMessage, reset) {
    const button = targetForm.querySelector(".submit-button");
    targetForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      targetStatus.hidden = true;
      targetStatus.className = "form-status";
      if (!validator()) {
        targetForm.querySelector("[aria-invalid='true']")?.focus();
        return;
      }
      button.disabled = true;
      button.querySelector("span").textContent = "Submitting…";
      try {
        const result = await saveRegistration(buildPayload(), table);
        showSuccess(targetStatus, result.demo
          ? "Registration validated in demo mode. Add your Supabase credentials to save submissions."
          : successMessage);
        reset();
        updateProgress();
      } catch (error) {
        targetStatus.classList.add("error");
        targetStatus.textContent = error.message || "Something went wrong. Please try again.";
        targetStatus.hidden = false;
      } finally {
        button.disabled = false;
        button.querySelector("span").textContent = "Submit registration";
      }
    });
  }

  handleSubmit(form, status, validate, () => ({
    registration_type: "Supplier",
    supplier_code: state.supplier.code,
    supplier_name: state.supplier.name,
    factories: factoryPicker.values(),
    full_name: fullName.value.trim(),
    email: email.value.trim().toLocaleLowerCase()
  }), "registrations", "Thank you. Your registration has been submitted successfully.", () => {
    form.reset();
    clearSupplier(false);
  });

  handleSubmit(factoryForm, factoryStatus, validateFactoryForm, () => ({
    registration_type: "Factory",
    factories: [{ code: state.registrationFactory.code, name: state.registrationFactory.name }],
    suppliers: allocatedSupplierPicker.values(),
    full_name: factoryName.value.trim(),
    email: factoryEmail.value.trim().toLocaleLowerCase()
  }), "registrations", "Thank you. Your factory registration has been submitted successfully.", () => {
    factoryForm.reset();
    clearRegistrationFactory(false);
  });

  handleSubmit(packagingForm, packagingStatus, validatePackagingForm, () => ({
    packaging_supplier: packagingSupplier.value,
    factories: packagingFactoryPicker.values(),
    full_name: packagingName.value.trim(),
    email: packagingEmail.value.trim().toLocaleLowerCase()
  }), "packaging_registrations", "Thank you. Your packaging supplier registration has been submitted successfully.", () => {
    packagingForm.reset();
    packagingFactoryPicker.setItems([]);
  });

  supplierInput.addEventListener("focus", () => { renderSuppliers(state.supplier ? "" : supplierInput.value); setPanel(supplierInput, supplierPanel, true); });
  supplierInput.addEventListener("input", () => {
    if (state.supplier && supplierInput.value !== state.supplier.name) {
      state.supplier = null;
      factoryPicker.setItems([]);
    }
    clearSupplierButton.hidden = !supplierInput.value;
    renderSuppliers(supplierInput.value);
    setPanel(supplierInput, supplierPanel, true);
  });
  supplierInput.addEventListener("keydown", (event) => { if (event.key === "Escape") setPanel(supplierInput, supplierPanel, false); });
  clearSupplierButton.addEventListener("click", () => clearSupplier());

  registrationFactoryInput.addEventListener("focus", () => { renderRegistrationFactories(state.registrationFactory ? "" : registrationFactoryInput.value); setPanel(registrationFactoryInput, registrationFactoryPanel, true); });
  registrationFactoryInput.addEventListener("input", () => {
    if (state.registrationFactory && registrationFactoryInput.value !== state.registrationFactory.name) {
      state.registrationFactory = null;
      noSuppliersNote.hidden = true;
      allocatedSupplierPicker.setItems([]);
    }
    clearRegistrationFactoryButton.hidden = !registrationFactoryInput.value;
    renderRegistrationFactories(registrationFactoryInput.value);
    setPanel(registrationFactoryInput, registrationFactoryPanel, true);
  });
  registrationFactoryInput.addEventListener("keydown", (event) => { if (event.key === "Escape") setPanel(registrationFactoryInput, registrationFactoryPanel, false); });
  clearRegistrationFactoryButton.addEventListener("click", () => clearRegistrationFactory());

  packagingSupplier.addEventListener("change", () => {
    setFieldError(packagingSupplier, "packaging-supplier-error", "");
    const codes = packagingFactories[packagingSupplier.value] || [];
    packagingFactoryPicker.setItems(codes.map((code) => factoryByCode.get(code)).filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name)));
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#supplier-combobox")) setPanel(supplierInput, supplierPanel, false);
    if (!event.target.closest("#factory-registration-combobox")) setPanel(registrationFactoryInput, registrationFactoryPanel, false);
  });

  [[fullName, "name-error"], [email, "email-error"], [factoryName, "factory-name-error"], [factoryEmail, "factory-email-error"],
    [packagingName, "packaging-name-error"], [packagingEmail, "packaging-email-error"]]
    .forEach(([input, errorId]) => input.addEventListener("input", () => setFieldError(input, errorId, "")));

  typeRadios.forEach((radio) => radio.addEventListener("change", () => selectRegistrationType(radio.value)));
  // Option clicks, typing and selects all bubble here after their own handlers have updated state.
  ["click", "input", "change"].forEach((name) => document.addEventListener(name, updateProgress));

  updateProgress();
})();
