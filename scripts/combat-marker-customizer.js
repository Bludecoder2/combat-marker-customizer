const MODULE_ID = "combat-marker-customizer";

const SETTINGS = {
  USE_PLAYER_COLOR: "usePlayerColor",
  FRIENDLY_COLOR: "friendlyColor",
  NEUTRAL_COLOR: "neutralColor",
  HOSTILE_COLOR: "hostileColor",
  SECRET_COLOR: "secretColor",
  MARKER_SCALE: "markerScale"
};

const COLOR_SETTINGS = [
  SETTINGS.FRIENDLY_COLOR,
  SETTINGS.NEUTRAL_COLOR,
  SETTINGS.HOSTILE_COLOR,
  SETTINGS.SECRET_COLOR
];

Hooks.once("init", registerSettings);
Hooks.on("renderSettingsConfig", addColorPickersToSettings);

Hooks.once("ready", () => {
  const MarkerClass = foundry?.canvas?.placeables?.tokens?.TokenTurnMarker;

  if (!MarkerClass?.prototype?.draw) {
    console.error(`${MODULE_ID} | TokenTurnMarker could not be found.`);
    return;
  }

  if (MarkerClass.prototype._combatMarkerCustomizerWrapped) return;

  const originalDraw = MarkerClass.prototype.draw;
  const originalAnimate = MarkerClass.prototype.animate;

  MarkerClass.prototype.draw = async function (...args) {
    const result = await originalDraw.apply(this, args);

    try {
      customizeMarker(this);
      applyMarkerScale(this);
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to customize the combat marker.`, error);
    }

    return result;
  };

  // Foundry applies the pulse animation during TokenTurnMarker#animate. Apply
  // our user scale only after Foundry has calculated that frame's pulse scale.
  // This preserves pulse and spin while changing the overall marker size.
  if (typeof originalAnimate === "function") {
    MarkerClass.prototype.animate = function (...args) {
      const result = originalAnimate.apply(this, args);

      try {
        applyMarkerScaleMultiplier(this);
      } catch (error) {
        console.error(`${MODULE_ID} | Failed to scale the animated combat marker.`, error);
      }

      return result;
    };
  }

  MarkerClass.prototype._combatMarkerCustomizerWrapped = true;
  refreshCurrentMarker();
});

function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.USE_PLAYER_COLOR, {
    name: "Use Player Color for Player Characters",
    hint: "When a character is owned by a non-GM player, use that player's Foundry user color instead of the Friendly color.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: refreshCurrentMarker
  });

  registerColorSetting(
    SETTINGS.FRIENDLY_COLOR,
    "Friendly Marker Color",
    "Color used for friendly tokens without an assigned player.",
    "#2ecc71"
  );

  registerColorSetting(
    SETTINGS.NEUTRAL_COLOR,
    "Neutral Marker Color",
    "Color used for neutral tokens.",
    "#3498db"
  );

  registerColorSetting(
    SETTINGS.HOSTILE_COLOR,
    "Hostile Marker Color",
    "Color used for hostile tokens.",
    "#e74c3c"
  );

  registerColorSetting(
    SETTINGS.SECRET_COLOR,
    "Secret Marker Color",
    "Color used for secret tokens.",
    "#9b59b6"
  );

  game.settings.register(MODULE_ID, SETTINGS.MARKER_SCALE, {
    name: "Marker Size",
    hint: "Size of the combat turn marker relative to Foundry's normal marker size. 1.00 keeps the default size.",
    scope: "world",
    config: true,
    type: Number,
    default: 1.15,
    range: {
      min: 0.5,
      max: 2.5,
      step: 0.05
    },
    onChange: refreshCurrentMarker
  });
}

function registerColorSetting(key, name, hint, defaultValue) {
  game.settings.register(MODULE_ID, key, {
    name,
    hint,
    scope: "world",
    config: true,
    type: String,
    default: defaultValue,
    onChange: refreshCurrentMarker
  });
}

/**
 * Foundry's SettingsConfig renders String settings as normal text inputs.
 * Add a native color button beside each marker-color field while keeping the
 * hexadecimal text field available for precise values and copy/paste.
 */
function addColorPickersToSettings(_app, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;

  for (const key of COLOR_SETTINGS) {
    const settingName = `${MODULE_ID}.${key}`;
    const textInput = root.querySelector(`input[name="${settingName}"]`);
    if (!textInput || textInput.dataset.cmcColorPickerAttached === "true") continue;

    textInput.dataset.cmcColorPickerAttached = "true";
    textInput.pattern = "#[0-9a-fA-F]{6}";
    textInput.placeholder = "#RRGGBB";

    const picker = document.createElement("input");
    picker.type = "color";
    picker.classList.add("color");
    picker.title = "Choose color";
    picker.setAttribute("aria-label", "Choose color");
    picker.value = normalizeHexColor(textInput.value) ?? "#ffffff";

    picker.addEventListener("input", () => {
      textInput.value = picker.value;
      textInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const syncPickerFromText = () => {
      const normalized = normalizeHexColor(textInput.value);
      if (normalized) picker.value = normalized;
    };

    textInput.addEventListener("input", syncPickerFromText);
    textInput.addEventListener("change", syncPickerFromText);

    textInput.insertAdjacentElement("afterend", picker);
  }
}

function normalizeHexColor(value) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  const shortMatch = trimmed.match(/^#?([0-9a-fA-F]{3})$/);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  const longMatch = trimmed.match(/^#?([0-9a-fA-F]{6})$/);
  return longMatch ? `#${longMatch[1].toLowerCase()}` : null;
}

function customizeMarker(marker) {
  const token = marker.token;
  const mesh = marker.mesh;

  if (!token || !mesh) return;

  const color = colorToNumber(getMarkerColor(token));
  if (!Number.isFinite(color)) return;

  // Foundry applies its own disposition tint directly to the marker mesh.
  // Reset that tint first, otherwise both colors are multiplied together.
  mesh.tint = 0xFFFFFF;

  // Recolor the complete marker from its luminance instead of multiplying
  // the original pixels. This prevents remnants of Foundry's original tint.
  applyColorizationFilter(mesh, color);

  applyMarkerScale(marker);
}

function getConfiguredMarkerScale() {
  const configured = Number(game.settings.get(MODULE_ID, SETTINGS.MARKER_SCALE));
  return Number.isFinite(configured) && configured > 0 ? configured : 1;
}

function applyMarkerScale(marker) {
  if (!marker?.scale) return;
  const factor = getConfiguredMarkerScale();
  marker.scale.set(factor, factor);
}

function applyMarkerScaleMultiplier(marker) {
  if (!marker?.scale) return;

  const factor = getConfiguredMarkerScale();
  marker.scale.set(marker.scale.x * factor, marker.scale.y * factor);
}

function applyColorizationFilter(mesh, color) {
  const ColorMatrixFilter = PIXI?.ColorMatrixFilter ?? PIXI?.filters?.ColorMatrixFilter;
  if (!ColorMatrixFilter) {
    mesh.tint = color;
    return;
  }

  let filter = mesh.filters?.find(existing => existing?._combatMarkerCustomizerFilter);

  if (!filter) {
    filter = new ColorMatrixFilter();
    filter._combatMarkerCustomizerFilter = true;
    mesh.filters = [...(mesh.filters ?? []), filter];
  }

  const red = ((color >> 16) & 0xFF) / 255;
  const green = ((color >> 8) & 0xFF) / 255;
  const blue = (color & 0xFF) / 255;

  // Preserve the source image's light and dark detail while replacing its hue.
  // A marker asset with neutral white/grey artwork gives the cleanest result.
  const lr = 0.299;
  const lg = 0.587;
  const lb = 0.114;

  filter.matrix = [
    lr * red,   lg * red,   lb * red,   0, 0,
    lr * green, lg * green, lb * green, 0, 0,
    lr * blue,  lg * blue,  lb * blue,  0, 0,
    0,          0,          0,          1, 0
  ];
}

function getMarkerColor(token) {
  const actor = token.actor;
  const usePlayerColor = game.settings.get(MODULE_ID, SETTINGS.USE_PLAYER_COLOR);

  if (usePlayerColor && actor?.type === "character") {
    const owner = getPlayerOwner(actor);
    if (owner?.color) return owner.color;
  }

  switch (token.document.disposition) {
    case CONST.TOKEN_DISPOSITIONS.FRIENDLY:
      return game.settings.get(MODULE_ID, SETTINGS.FRIENDLY_COLOR);
    case CONST.TOKEN_DISPOSITIONS.NEUTRAL:
      return game.settings.get(MODULE_ID, SETTINGS.NEUTRAL_COLOR);
    case CONST.TOKEN_DISPOSITIONS.HOSTILE:
      return game.settings.get(MODULE_ID, SETTINGS.HOSTILE_COLOR);
    case CONST.TOKEN_DISPOSITIONS.SECRET:
      return game.settings.get(MODULE_ID, SETTINGS.SECRET_COLOR);
    default:
      return game.settings.get(MODULE_ID, SETTINGS.NEUTRAL_COLOR);
  }
}

function getPlayerOwner(actor) {
  const owners = game.users.filter(user =>
    !user.isGM && actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
  );

  return owners.find(user => user.active) ?? owners[0] ?? null;
}

function colorToNumber(color) {
  if (color == null) return null;
  if (typeof color === "number") return color;

  if (typeof color === "object") {
    if (Number.isFinite(color.value)) return color.value;
    color = color.css ?? color.toString?.();
  }

  const normalized = normalizeHexColor(color);
  if (!normalized) return null;

  return Number.parseInt(normalized.slice(1), 16);
}

async function refreshCurrentMarker() {
  if (!canvas?.ready) return;

  const marker = canvas.tokens?.placeables
    ?.map(token => token.turnMarker)
    ?.find(Boolean);

  if (!marker) return;

  try {
    await marker.draw();
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to refresh the current combat marker.`, error);
  }
}
