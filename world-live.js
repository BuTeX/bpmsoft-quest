(() => {
  "use strict";

  const root = document.documentElement;
  if (!root.classList.contains("living-world-update")) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const compactViewport = window.matchMedia("(max-width: 700px)");
  const stageDefinitions = [
    {
      selector: ".world-overview-stage",
      theme: "world",
      status: "Маршрут аналитика",
      effects: ["horizon-light", "regional-weather", "sea-sparkles", "process-elements", "city-beacons"]
    },
    {
      selector: ".world-stage",
      theme: "academy",
      status: "Эфир Академии",
      effects: ["aurora", "rune-orbits", "stardust", "comets", "tower-beacons"]
    },
    {
      selector: ".c2-world-stage",
      theme: "copper",
      status: "Цех в движении",
      effects: ["furnace-glow", "smoke-plumes", "embers", "spark-belts", "press-pulses"]
    },
    {
      selector: ".c3-world-stage",
      theme: "roads",
      status: "Маршруты активны",
      effects: ["route-grid", "data-streams", "data-packets", "traffic-trails", "hub-pings"]
    },
    {
      selector: ".c4-world-stage",
      theme: "gold",
      status: "Город работает",
      effects: ["sunbeams", "window-glows", "gold-dust", "delivery-routes", "checkout-pulses"]
    },
    {
      selector: ".c5-world-stage",
      theme: "avia",
      status: "Воздушный поток",
      effects: ["high-altitude-light", "cloudbanks", "aircraft-lights", "contrails", "radar"]
    }
  ];
  const nodeSelector = [
    ".world-city-node",
    ".map-node",
    ".c2-map-node",
    ".c3-map-node",
    ".c4-map-node",
    ".c5-map-node"
  ].join(",");
  const worldProcessElements = [
    ["start","30%","-2s","-7deg"],
    ["user-action","68%","-7s","5deg"],
    ["gateway","18%","-5s","-4deg"],
    ["system-action","49%","-17s","3deg"],
    ["gateway","57%","-15s","4deg"],
    ["intermediate","81%","-22s","-3deg"],
    ["finish","39%","-27s","6deg"],
    ["gateway","76%","-25s","-5deg"]
  ];

  function createElement(className, parent, text = "") {
    const element = document.createElement("span");
    element.className = className;
    element.setAttribute("aria-hidden", "true");
    if (text) element.textContent = text;
    parent.append(element);
    return element;
  }

  function markEffect(element, effectName) {
    element.classList.add("living-world-effect", `living-world-effect-${effectName}`);
    element.dataset.worldEffect = effectName;
    return element;
  }

  function createAtmosphere(stage, definition) {
    stage.dataset.livingWorld = definition.theme;
    stage.dataset.worldEffects = definition.effects.join(" ");

    const layer = document.createElement("div");
    layer.className = "living-world-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.dataset.effectCount = String(definition.effects.length);

    markEffect(createElement("living-world-sky", layer), definition.effects[0]);
    const clouds = markEffect(createElement("living-world-clouds", layer), definition.effects[1]);
    for (let index = 0; index < 3; index += 1) {
      const cloud = createElement(`living-world-cloud living-world-cloud-${index + 1}`, clouds);
      cloud.style.setProperty("--cloud-delay", `${index * -9}s`);
    }

    const particles = markEffect(createElement("living-world-particles", layer), definition.effects[2]);
    const particleCount = compactViewport.matches ? 10 : 20;
    for (let index = 0; index < particleCount; index += 1) {
      const particle = createElement(`living-world-particle living-world-particle-${index % 3}`, particles);
      particle.style.setProperty("--particle-x", `${(index * 37 + 11) % 97}%`);
      particle.style.setProperty("--particle-y", `${(index * 53 + 17) % 91}%`);
      particle.style.setProperty("--particle-delay", `${-((index * 2.1) % 15)}s`);
      particle.style.setProperty("--particle-duration", `${10 + (index % 5) * 1.7}s`);
      particle.style.setProperty("--particle-size", `${2 + (index % 3)}px`);
    }

    const passages = markEffect(createElement("living-world-passages", layer), definition.effects[3]);
    if (definition.theme === "world") {
      worldProcessElements.forEach(([kind, top, delay, rotation]) => {
        const passage = createElement("living-world-passage", passages);
        passage.dataset.processElement = kind;
        passage.style.cssText = `--passage-top:${top};--passage-delay:${delay};--passage-duration:30s;--passage-rotation:${rotation};--process-icon:url("assets/process-${kind}.svg")`;
      });
    } else {
      createElement("living-world-passage living-world-passage-primary", passages);
      createElement("living-world-passage living-world-passage-secondary", passages);
      createElement("living-world-passage living-world-passage-tertiary", passages);
    }

    const signals = markEffect(createElement("living-world-signals", layer), definition.effects[4]);
    createElement("living-world-signal living-world-signal-primary", signals);
    createElement("living-world-signal living-world-signal-secondary", signals);
    createElement("living-world-signal living-world-signal-tertiary", signals);
    createElement("living-world-vignette", layer);
    stage.append(layer);

    const badge = document.createElement("div");
    badge.className = "living-world-badge";
    badge.setAttribute("aria-hidden", "true");
    createElement("living-world-badge-pulse", badge);
    const badgeCopy = createElement("living-world-badge-copy", badge, definition.status);
    const badgeProgress = createElement("living-world-badge-progress", badge);
    createElement("living-world-badge-progress-fill", badgeProgress);
    stage.append(badge);

    const updateProgress = () => {
      const nodes = [...stage.querySelectorAll(nodeSelector)];
      const completed = nodes.filter((node) => node.classList.contains("is-complete")).length;
      const available = nodes.filter((node) => !node.disabled && node.getAttribute("aria-disabled") !== "true").length;
      const total = nodes.length || 9;
      const progress = Math.min(1, completed / total);
      stage.style.setProperty("--world-progress", `${(progress * 100).toFixed(2)}%`);
      badgeCopy.textContent = `${definition.status} · ${completed}/${total}`;
      stage.classList.toggle("has-world-progress", completed > 0);
      stage.classList.toggle("has-world-route", available > 1);
    };

    updateProgress();
    const mutationObserver = new MutationObserver((mutations) => {
      const gameplayChanged = mutations.some((mutation) => {
        const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        if (!target || target === stage) return false;
        return !target.closest(".living-world-layer, .living-world-badge");
      });
      if (gameplayChanged) updateProgress();
    });
    mutationObserver.observe(stage, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "disabled"]
    });

    return stage;
  }

  const stages = stageDefinitions
    .map((definition) => {
      const stage = document.querySelector(definition.selector);
      return stage ? createAtmosphere(stage, definition) : null;
    })
    .filter(Boolean);

  if ("IntersectionObserver" in window) {
    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle("is-world-visible", entry.isIntersecting);
        });
      },
      { threshold: 0.08 }
    );
    stages.forEach((stage) => visibilityObserver.observe(stage));
  } else {
    stages.forEach((stage) => stage.classList.add("is-world-visible"));
  }

  const syncPageVisibility = () => {
    root.classList.toggle("living-world-paused", document.hidden);
  };
  document.addEventListener("visibilitychange", syncPageVisibility);
  syncPageVisibility();
})();
