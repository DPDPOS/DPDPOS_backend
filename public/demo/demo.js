const DEFAULTS = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  email: "admin@demo.dpdpos.local",
  password: "ChangeMe123!",
};

const state = {
  token: localStorage.getItem("dpdpos_demo_token") || "",
  me: null,
};

const $ = (id) => document.getElementById(id);

function envelope(payload) {
  if (payload && typeof payload === "object" && "data" in payload) {
    return payload.data;
  }
  return payload;
}

async function api(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(path, { ...options, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      json?.error?.message || json?.message || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return envelope(json);
}

async function checkApi() {
  const el = $("apiStatus");
  try {
    const data = await api("/readyz");
    el.textContent = data?.status === "ready" ? "API ready · Postgres + Redis" : "API up";
    el.className = "status ok";
    return true;
  } catch {
    el.textContent = "API offline — run npm run demo first";
    el.className = "status bad";
    return false;
  }
}

function showBoard(show) {
  $("loginPanel").hidden = show;
  $("board").hidden = !show;
}

function renderJourney(dash) {
  const steps = [
    {
      step: "01 Auth",
      title: "Fiduciary admin",
      detail: state.me?.email || "Signed in",
    },
    {
      step: "02 Framework",
      title: "Controls live",
      detail: `${dash.evidence?.totalControls ?? 0} controls in published roadmap`,
    },
    {
      step: "03 Consent",
      title: "Lawful basis",
      detail: `${dash.consent?.granted ?? 0} granted · ${dash.consent?.withdrawn ?? 0} withdrawn`,
    },
    {
      step: "04 Rights",
      title: "Principal requests",
      detail: `${dash.rightsRequests?.closed ?? 0} closed · ${dash.rightsRequests?.open ?? 0} open`,
    },
    {
      step: "05 Validate",
      title: "Rule engine",
      detail: `${dash.complianceScore?.passed ?? 0}/${dash.complianceScore?.totalRules ?? 0} rules passed`,
    },
    {
      step: "06 Enforce",
      title: "Violations",
      detail: `${dash.violations?.total ?? 0} on the board`,
    },
    {
      step: "07 Evidence",
      title: "Coverage",
      detail: `${dash.evidence?.coveragePercent ?? 0}% controls with evidence`,
    },
    {
      step: "08 Score",
      title: "Executive view",
      detail: `Score ${dash.complianceScore?.score ?? 0}`,
    },
  ];

  $("journey").innerHTML = steps
    .map(
      (s) => `<li>
        <span class="step">${s.step}</span>
        <strong>${s.title}</strong>
        <span>${s.detail}</span>
      </li>`,
    )
    .join("");
}

function kv(rows) {
  return `<dl class="kv">${rows
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
    .join("")}</dl>`;
}

function bars(entries, tone = "ok") {
  const max = Math.max(1, ...entries.map(([, n]) => Number(n) || 0));
  return `<div class="bars">${entries
    .map(([label, value]) => {
      const n = Number(value) || 0;
      const pct = Math.round((n / max) * 100);
      const cls = tone === "danger" && n > 0 ? "danger" : tone === "warn" ? "warn" : "";
      return `<div class="bar-row">
        <label><span>${label}</span><span>${n}</span></label>
        <div class="track"><div class="fill ${cls}" style="width:${pct}%"></div></div>
      </div>`;
    })
    .join("")}</div>`;
}

function renderPanels(dash) {
  const violationStatus = Object.entries(dash.violations?.byStatus || {});
  const violationSeverity = Object.entries(dash.violations?.bySeverity || {});
  const rightsByType = Object.entries(dash.rightsRequests?.byType || {});

  $("panels").innerHTML = `
    <article class="panel">
      <h3>Consent posture</h3>
      ${kv([
        ["Total records", dash.consent?.totalRecords ?? 0],
        ["Granted", dash.consent?.granted ?? 0],
        ["Withdrawn", dash.consent?.withdrawn ?? 0],
      ])}
    </article>
    <article class="panel">
      <h3>Rights request queue</h3>
      ${kv([
        ["Total", dash.rightsRequests?.total ?? 0],
        ["Open", dash.rightsRequests?.open ?? 0],
        ["Closed", dash.rightsRequests?.closed ?? 0],
        [
          "Avg resolution (days)",
          dash.rightsRequests?.avgResolutionDays == null
            ? "—"
            : Number(dash.rightsRequests.avgResolutionDays).toFixed(2),
        ],
      ])}
      ${rightsByType.length ? `<div style="margin-top:14px">${bars(rightsByType)}</div>` : ""}
    </article>
    <article class="panel">
      <h3>Violation board</h3>
      ${kv([["Total open items", dash.violations?.total ?? 0]])}
      ${
        violationStatus.length
          ? `<div style="margin-top:14px"><p style="margin:0 0 8px;font-size:0.8rem;color:rgba(11,31,28,.62)">By status</p>${bars(violationStatus, "warn")}</div>`
          : ""
      }
      ${
        violationSeverity.length
          ? `<div style="margin-top:14px"><p style="margin:0 0 8px;font-size:0.8rem;color:rgba(11,31,28,.62)">By severity</p>${bars(violationSeverity, "danger")}</div>`
          : ""
      }
    </article>
    <article class="panel">
      <h3>Evidence coverage</h3>
      ${kv([
        ["Controls", dash.evidence?.totalControls ?? 0],
        ["With evidence", dash.evidence?.controlsWithEvidence ?? 0],
        ["Coverage", `${dash.evidence?.coveragePercent ?? 0}%`],
      ])}
      <div style="margin-top:14px" class="track">
        <div class="fill" style="width:${dash.evidence?.coveragePercent ?? 0}%"></div>
      </div>
    </article>
  `;
}

function renderScore(dash) {
  const score = dash.complianceScore?.score ?? 0;
  $("scoreValue").textContent = String(score);
  $("scoreRing").style.setProperty("--pct", `${score}%`);
  $("scoreDetail").textContent =
    "Live aggregate from validation outcomes for this Data Fiduciary organization.";
  $("scoreStats").innerHTML = [
    `<li>${dash.complianceScore?.passed ?? 0} passed</li>`,
    `<li>${dash.complianceScore?.failed ?? 0} failed</li>`,
    `<li>${dash.complianceScore?.totalRules ?? 0} rules</li>`,
    `<li>${dash.violations?.total ?? 0} violations</li>`,
  ].join("");
}

async function loadDashboard() {
  const [me, dash] = await Promise.all([
    api("/api/v1/auth/me"),
    api("/api/v1/analytics/dashboard"),
  ]);
  state.me = me;
  $("orgLabel").textContent = me?.name ? `${me.name}'s organization` : "Demo Data Fiduciary";
  const roles = Array.isArray(me?.roles)
    ? me.roles.map((r) => (typeof r === "string" ? r : r.name)).join(", ")
    : "";
  $("sessionMeta").textContent = `${me?.email || ""} · ${roles}`;
  renderScore(dash);
  renderJourney(dash);
  renderPanels(dash);
  showBoard(true);
}

async function login(event) {
  event.preventDefault();
  const err = $("loginError");
  err.hidden = true;
  $("loginBtn").disabled = true;
  try {
    const body = {
      organizationId: $("orgId").value.trim(),
      email: $("email").value.trim(),
      password: $("password").value,
    };
    const data = await api("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    });
    state.token = data?.tokens?.accessToken || data?.accessToken || "";
    if (!state.token) throw new Error("Login succeeded but no access token returned");
    localStorage.setItem("dpdpos_demo_token", state.token);
    await loadDashboard();
  } catch (e) {
    err.textContent = e.message || "Login failed";
    err.hidden = false;
  } finally {
    $("loginBtn").disabled = false;
  }
}

function logout() {
  state.token = "";
  state.me = null;
  localStorage.removeItem("dpdpos_demo_token");
  showBoard(false);
}

function fillDefaults() {
  $("orgId").value = DEFAULTS.organizationId;
  $("email").value = DEFAULTS.email;
  $("password").value = DEFAULTS.password;
}

$("loginForm").addEventListener("submit", login);
$("refreshBtn").addEventListener("click", () => {
  loadDashboard().catch((e) => {
    alert(e.message);
    logout();
  });
});
$("logoutBtn").addEventListener("click", logout);

fillDefaults();
checkApi().then(async (ok) => {
  if (ok && state.token) {
    try {
      await loadDashboard();
    } catch {
      logout();
    }
  }
});
