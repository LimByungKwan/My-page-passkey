"use strict";
(() => {
  const landscape = '<svg viewBox="0 0 500 360" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="500" height="360" fill="#cce9f3"/><circle cx="366" cy="77" r="35" fill="#fff1bd"/><g fill="#fff" opacity=".8"><path d="M36 95c0-15 16-22 27-14 8-25 43-27 56-4 22-9 44 5 43 22H36z"/><path d="M264 136c-3-14 12-26 25-20 9-21 36-22 46-4 20-5 36 6 35 24z"/></g><path d="M0 235Q100 155 213 227T500 205V360H0" fill="#95bda2"/><path d="M0 280Q123 198 273 269T500 235V360H0" fill="#719d7c"/><path d="M0 320Q100 279 223 308T500 300V360H0" fill="#bdd0a2"/><path d="M250 360Q230 327 285 305T319 273Q298 296 263 310T282 360" fill="#ece5bc"/><g class="tree-sway"><path d="M91 312V170" stroke="#726b46" stroke-width="9" stroke-linecap="round"/><path d="M91 237l-23-23m23 9 26-26" stroke="#726b46" stroke-width="5" stroke-linecap="round"/><ellipse cx="91" cy="162" rx="57" ry="69" fill="#3f7d62"/><ellipse cx="65" cy="183" rx="34" ry="46" fill="#4b8969"/><ellipse cx="113" cy="177" rx="35" ry="46" fill="#5c9670"/></g><g class="tree-sway slow"><path d="M417 330V206" stroke="#736b49" stroke-width="8" stroke-linecap="round"/><path d="M417 263l-22-26m22 9 23-20" stroke="#736b49" stroke-width="4"/><ellipse cx="418" cy="188" rx="48" ry="61" fill="#326f57"/><ellipse cx="392" cy="213" rx="32" ry="40" fill="#427f5d"/><ellipse cx="440" cy="208" rx="32" ry="39" fill="#558c66"/></g><g fill="#789955"><ellipse cx="39" cy="343" rx="31" ry="15"/><ellipse cx="463" cy="350" rx="40" ry="20"/></g><g stroke="#527c70" stroke-width="2.5" fill="none" stroke-linecap="round"><path d="M218 89q8-8 15 0 8-8 15 0"/><path d="M200 106q6-6 12 0 6-6 12 0"/></g><g fill="#fff4cf"><circle cx="172" cy="325" r="3"/><circle cx="188" cy="334" r="3"/><circle cx="349" cy="341" r="3"/></g></svg>';
  const clouds = document.createElement("div");
  clouds.className = "garden-clouds";
  clouds.setAttribute("aria-hidden", "true");
  clouds.innerHTML = '<i class="cloud one"></i><i class="cloud two"></i><i class="cloud three"></i>';
  const scenery = document.createElement("div");
  scenery.className = "garden-scenery";
  scenery.setAttribute("aria-hidden", "true");
  scenery.innerHTML = '<svg viewBox="0 0 1600 400" preserveAspectRatio="xMidYMax slice" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><path d="M0 280Q160 205 340 300T740 305T1190 280T1600 270V400H0" fill="#d8e7cc"/><path d="M0 350Q230 275 450 355T960 345T1600 325V400H0" fill="#bed8b9"/><g class="tree-sway"><path d="M78 391V170" stroke="#8b956e" stroke-width="9"/><ellipse cx="76" cy="155" rx="72" ry="96" fill="#91b89b"/><ellipse cx="35" cy="188" rx="46" ry="67" fill="#a1c3a3"/><ellipse cx="112" cy="194" rx="45" ry="63" fill="#88b491"/></g><g class="tree-sway slow"><path d="M1507 390V135" stroke="#8b956e" stroke-width="11"/><ellipse cx="1505" cy="136" rx="83" ry="109" fill="#8db298"/><ellipse cx="1458" cy="183" rx="54" ry="75" fill="#9abda0"/><ellipse cx="1554" cy="185" rx="57" ry="73" fill="#a8c8a3"/></g></svg>';
  document.body.prepend(scenery);
  document.body.prepend(clouds);

  const compass = document.querySelector(".field-note .compass");
  if (compass) {
    compass.className = "garden-window";
    compass.innerHTML = landscape;
  }
  const gateArt = document.querySelector(".gate-art");
  if (gateArt) gateArt.innerHTML = landscape;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduced && "IntersectionObserver" in window) {
    const sections = document.querySelectorAll(".garden-public .section, .garden-public .purpose, .garden-public .private-gate");
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("garden-visible");
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: .08 });
    for (const section of sections) {
      section.setAttribute("data-garden-reveal", "");
      observer.observe(section);
    }
    document.documentElement.classList.add("motion-ready");
  }
  const badge = document.getElementById("session-state");
  if (badge) {
    const update = () => { badge.dataset.locked = badge.textContent.includes("잠김") ? "true" : "false"; };
    new MutationObserver(update).observe(badge, { childList: true, characterData: true, subtree: true });
    update();
  }
})();
