# Combat Marker Customizer

A Foundry VTT v14 module that customizes the native combat turn marker.

## Features

- Separate colors for Friendly, Neutral, Hostile, and Secret tokens
- Native color picker buttons plus editable hexadecimal color fields
- Uses the assigned Foundry player's user color for owned player characters
- Adjustable combat marker size
- Works with the native marker image selected in Foundry's Combat Tracker settings

## Usage

1. Enable the module in your world.
2. Open **Game Settings → Configure Settings → Module Settings**.
3. Configure the marker colors and size under **Combat Marker Customizer**.
4. Keep Foundry's native combat turn marker enabled.

The module changes only the marker shown around the active combatant. It does not change token rings, token borders, or combat tracker portraits.

For the cleanest recoloring, use a neutral white or grayscale marker image. Marker images with a strongly baked-in color can retain dark tonal characteristics after recoloring.


## Version 1.0.4

- Fixed marker scaling on Foundry VTT v14 by scaling the animated marker mesh.
- Preserves Foundry's pulse and spin animation without cumulative scaling.


## 1.0.4
- Marker scaling is now enforced on the outer turn-marker container every frame, so Foundry's native pulse animation can no longer overwrite it.
