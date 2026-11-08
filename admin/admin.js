(() => {
  "use strict";
  const config = window.SUPABASE_CONFIG || {};
  const publishableKey = config.publishableKey || config.anonKey;
  const tokenKey = "cartonconnect_admin_token";
  const form = document.querySelector("#admin-login-form");
  const passwordInput = document.querySelector("#admin-password");
  const errorMessage = document.querySelector("#login-error");
  const submitButton = form.querySelector("button[type='submit']");

  function friendlyError(error) {
    if (/invalid admin password|incorrect password/i.test(error.message)) return "Incorrect password.";
    if (/could not find the function|admin_session_valid|schema cache|out of date/i.test(error.message)) {
      return "Admin database setup is out of date. Run the latest supabase-schema.sql, then try again.";
    }
    return error.message || "Sign in failed. Please try again.";
  }

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

  const openDashboard = () => window.location.replace("../admin-dashboard/");
  document.querySelector("#year").textContent = new Date().getFullYear();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorMessage.textContent = "";
    submitButton.disabled = true;
    submitButton.querySelector("span").textContent = "Signing in...";
    try {
      const token = await callRpc("admin_login", { p_password: passwordInput.value });
      if (!token) throw new Error("Incorrect password.");
      if (typeof token !== "string" || token.length < 32) {
        throw new Error("Admin database setup is out of date.");
      }
      localStorage.setItem(tokenKey, token);
      openDashboard();
    } catch (error) {
      localStorage.removeItem(tokenKey);
      errorMessage.textContent = friendlyError(error);
    } finally {
      submitButton.disabled = false;
      submitButton.querySelector("span").textContent = "Sign in";
    }
  });

  document.querySelector("#toggle-password").addEventListener("click", (event) => {
    const visible = passwordInput.type === "text";
    passwordInput.type = visible ? "password" : "text";
    event.currentTarget.setAttribute("aria-label", visible ? "Show password" : "Hide password");
    event.currentTarget.setAttribute("aria-pressed", String(!visible));
    event.currentTarget.querySelector(".eye-open").classList.toggle("is-hidden", !visible);
    event.currentTarget.querySelector(".eye-closed").classList.toggle("is-hidden", visible);
    passwordInput.focus();
  });

  const reason = new URLSearchParams(window.location.search).get("reason");
  if (reason === "setup") errorMessage.textContent = "Admin database setup is out of date. Run the latest supabase-schema.sql, then try again.";
  else if (reason === "session") errorMessage.textContent = "Your admin session expired. Please sign in again.";

  const existingToken = localStorage.getItem(tokenKey);
  if (existingToken) {
    callRpc("admin_session_valid", { p_token: existingToken })
      .then((valid) => {
        if (valid) openDashboard();
        else {
          localStorage.removeItem(tokenKey);
          errorMessage.textContent = "Your admin session expired. Please sign in again.";
        }
      })
      .catch((error) => {
        localStorage.removeItem(tokenKey);
        errorMessage.textContent = friendlyError(error);
      });
  }
})();
