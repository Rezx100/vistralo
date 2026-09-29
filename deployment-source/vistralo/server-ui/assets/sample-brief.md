# Storefront design review

Fictional sample visual brief for **Fernhill Goods**. This is authored demonstration content, not an analysis of a live website.

## 1. Visual direction

A quiet storefront balances generous space with legible product details. Warm neutral surfaces support muted botanical and terracotta accents. The product photography area remains separate from purchase controls.

## 2. Page structure

The opening section pairs a clear heading with a product still life. A collection grid follows with three products per row on desktop. Each product has a visible name and price. The product detail places the image beside its description and one primary purchase action.

## 3. Typography and color

Use Inter for headings, labels and body text. Keep paragraph contrast strong against the neutral background. Reserve deep green for primary actions, and keep secondary controls visually quiet. Prices use tabular numerals where alignment matters.

## 4. Interaction references

1. Header navigation remains in a predictable order.
2. The collection action opens the product grid.
3. Each product card links through its title.
4. Product names remain visible when images are unavailable.
5. Prices sit directly below product names.
6. Image aspect ratios remain consistent across the collection.
7. Product details retain a clear heading hierarchy.
8. Variant labels describe the selected option in text.
9. Purchase actions use explicit labels.
10. Shipping information is visible near the action.
11. Keyboard focus remains visible on every control.
12. Motion respects the reduced-motion preference.
13. Mobile layouts preserve the same reading order.
14. Confirmation feedback is announced without moving focus.

## 5. Implementation notes

Use semantic navigation, headings and buttons. Serve correctly sized images without upscaling. Preserve useful alternative text. Test the product grid at narrow viewports and with long translated names. Confirm real checkout behavior separately; this sample contains no payment integration.
