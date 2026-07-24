(() => {
  "use strict";

  const root = document.documentElement;
  if (!root.classList.contains("living-world-update")) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const compactViewport = window.matchMedia("(max-width: 700px)");
  const stageDefinitions = [
    {
      selector: ".world-stage",
      theme: "academy",
      status: "Эфир Академии"
    },
    {
      selector: ".c2-world-stage",
      theme: "copper",
      status: "Цех в движении"
    },
    {
      selector: ".c3-world-stage",
      theme: "roads",
      status: "Маршруты активны"
    },
    {
      selector: ".c4-world-stage",
      theme: "gold",
      status: "Город работает"
    },
    {
      selector: ".c5-world-stage",
      theme: "avia",
      status: "Воздушный поток"
    }
  ];
  const nodeSelector = [
    ".map-node",
    ".c2-map-node",
    ".c3-map-node",
    ".c4-map-node",
    ".c5-map-node"
  ].join(",");

  function createElement(className, parent, text = "") {
    const element = document.createElement("span");
    element.className = className;
    element.setAttribute("aria-hidden", "true");
    if (text) element.textContent = text;
    parent.append(element);
    return element;
  }

  function createAtmosphere(stage, definition) {
    stage.dataset.livingWorld = definition.theme;
    stage.style.setProperty("--world-pan-x", "0px");
    stage.style.setProperty("--world-pan-y", "0px");

    const layer = document.createElement("div");
    layer.className = "living-world-layer";
    layer.setAttribute("aria-hidden", "true");

    createElement("living-world-sky", layer);
    const clouds = createElement("living-world-clouds", layer);
    for (let index = 0; index < 3; index += 1) {
      const cloud = createElement(`living-world-cloud living-world-cloud-${index + 1}`, clouds);
      cloud.style.setProperty("--cloud-delay", `${index * -7}s`);
    }

    const particles = createElement("living-world-particles", layer);
    const particleCount = compactViewport.matches ? 8 : 16;
    for (let index = 0; index < particleCount; index += 1) {
      const particle = createElement(`living-world-particle living-world-particle-${index % 3}`, particles);
      particle.style.setProperty("--particle-x", `${(index * 37 + 11) % 97}%`);
      particle.style.setProperty("--particle-y", `${(index * 53 + 17) % 91}%`);
      particle.style.setProperty("--particle-delay", `${-((index * 1.7) % 12)}s`);
      particle.style.setProperty("--particle-duration", `${8 + (index % 5) * 1.4}s`);
      particle.style.setProperty("--particle-size", `${2 + (index % 3)}px`);
    }

    createElement("living-world-passage living-world-passage-primary", layer);
    createElement("living-world-passage living-world-passage-secondary", layer);
    createElement("living-world-signal living-world-signal-primary", layer);
    createElement("living-world-signal living-world-signal-secondary", layer);
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
      const available = nodes.filter((node) => !node.disabled).length;
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

    if (!reducedMotion.matches && finePointer.matches) {
      stage.addEventListener("pointermove", (event) => {
        const bounds = stage.getBoundingClientRect();
        const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * -12;
        const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * -8;
        stage.style.setProperty("--world-pan-x", `${x.toFixed(2)}px`);
        stage.style.setProperty("--world-pan-y", `${y.toFixed(2)}px`);
      });
      stage.addEventListener("pointerleave", () => {
        stage.style.setProperty("--world-pan-x", "0px");
        stage.style.setProperty("--world-pan-y", "0px");
      });
    }

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
