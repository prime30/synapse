(() => {
  /*
   * Product Form Dynamic (PFD) - Unique Class Names:
   * - .pfd-variant-images (container for variant image data)
   * - .pfd-main-imgs (main images container)
   * - .pfd-thumb-imgs (thumbnail images container)
   * - .pfd-img-listing (individual variant image listing)
   * - .pfd-media-item (main image item)
   * - .pfd-media-thumb (thumbnail item)
   * - .pfd-img (thumbnail background image div)
   * - data-pfd-variant-id (variant ID attribute)
   * - .pfd-split-selection (split selection container)
   * - .pfd-standard-options (standard swatch options)
   * - .pfd-custom-options (custom dropdown options)
   * - .pfd-custom-dropdown (custom dropdown button)
   */

  // Custom options configuration - must match Liquid template
  const CUSTOM_OPTION_NAMES = [
    '14"',
    '16"',
    '26"',
    '28"',
    "Natural Wave",
    "Loose Curl",
    "Tight Curl",
  ];

  function isCustomOption(optionValue) {
    // Handle both cleaned (quotes removed) and uncleaned values
    const cleanedOptionValue = optionValue.replace(/"/g, "");
    return CUSTOM_OPTION_NAMES.some((customName) => {
      const cleanedCustomName = customName.replace(/"/g, "");
      return (
        optionValue.toLowerCase().includes(customName.toLowerCase()) ||
        cleanedOptionValue
          .toLowerCase()
          .includes(cleanedCustomName.toLowerCase())
      );
    });
  }

  // Override theme's swatch click handler
  function setupSwatchOverride() {
    // Use event capturing to intercept clicks before theme's handler
    document.addEventListener(
      "click",
      function (e) {
        const swatchItem = e.target.closest(
          "[data-swatch-item]:not(.is--selected)",
        );
        if (!swatchItem) return;

        // Check if this is within our product form
        const productForm = swatchItem.closest(
          ".t4s-product-form__variants, .t4s-form__product",
        );
        if (!productForm) return;

        // Stop the theme's handler from running
        e.stopImmediatePropagation();
        e.preventDefault();

        // Let our custom handler process it
        handleCustomSwatchClick(swatchItem, e);
      },
      true,
    ); // Use capture phase
  }

  function handleCustomSwatchClick(swatchItem, originalEvent) {
    const optEl = swatchItem.closest("[data-swatch-option]");
    if (!optEl) return;

    const optionIndex = Number(optEl.getAttribute("data-id"));
    if (Number.isNaN(optionIndex)) return;

    // Handle split selection - clear selections from both standard and custom areas
    if (optEl.classList.contains("pfd-split-option")) {
      optEl
        .querySelectorAll("[data-swatch-item].is--selected")
        .forEach((el) => el.classList?.remove("is--selected"));

      // Update custom dropdown text if selecting a standard option
      const value = swatchItem.getAttribute("data-value") || "";

      // Check if this swatch item is from the custom options area
      const isFromCustomDropdown = swatchItem.closest(".pfd-custom-options");

      if (!isFromCustomDropdown) {
        // Reset custom dropdown to default state when selecting standard option
        const customDropdown = optEl.querySelector(
          ".pfd-custom-dropdown [data-current-value]",
        );
        if (customDropdown) {
          const optionName = optEl.getAttribute("data-option-name") || "";
          customDropdown.textContent = `Custom ${optionName.toLowerCase()}`;
        }

        // Hide custom notice when standard option is selected
        const customNotice = optEl.querySelector(".pfd-custom-notice");
        if (customNotice) {
          customNotice.style.display = "none";
        }

        // Remove active state from dropdown button when standard option is selected
        const dropdownButton = optEl.querySelector(".pfd-custom-dropdown");
        if (dropdownButton) {
          dropdownButton.classList.remove("is--selected");
        }
      }
    } else {
      // Standard handling for non-split options
      optEl
        .querySelectorAll("[data-swatch-item].is--selected")
        .forEach((el) => el.classList?.remove("is--selected"));
    }

    // Always add selected class to the clicked item
    swatchItem.classList.add("is--selected");

    // Update current value display - handle both Color and Non-Color structures
    const value = swatchItem.getAttribute("data-value") || "";
    const optionUnit = optEl.getAttribute("data-option-unit") || "";
    const displayValue = getDisplayValue(value, optionUnit);

    // Check if this is a custom option to add badge
    const isFromCustomDropdown = swatchItem.closest(".pfd-custom-options");
    let titleElement = optEl.querySelector(".t4s-swatch__title--right .bold");
    if (titleElement) {
      // Non-Color section structure
      titleElement.textContent = displayValue;
    } else {
      // Color section structure - use the wrapper span
      titleElement = optEl.querySelector(".t4s-selected-value");
      if (titleElement) {
        titleElement.textContent = displayValue;
      }
    }

    // Update custom dropdown display for selected custom options
    if (isFromCustomDropdown) {
      const customDropdown = optEl.querySelector(
        ".pfd-custom-dropdown [data-current-value]",
      );
      const customDropdownButton = optEl.querySelector(".pfd-custom-dropdown");
      if (customDropdown) {
        customDropdown.innerHTML = `${displayValue} <span class="pfd-custom-badge">Custom</span>`;
      }
      // Add active state to dropdown button
      if (customDropdownButton) {
        customDropdownButton.classList.add("is--selected");
      }

      // Show custom notice and update text
      const customNotice = optEl.querySelector(".pfd-custom-notice");
      if (customNotice) {
        const optionName = optEl.getAttribute("data-option-name") || "item";
        const noticeText = customNotice.querySelector(
          ".pfd-custom-notice-text",
        );
        if (noticeText) {
          noticeText.innerHTML = `Custom ${optionName.toLowerCase()}s are <strong>made to order</strong>. Please allow <span class="pfd-custom-notice-highlight">6-8 weeks</span> for delivery. Custom orders are non-cancellable/refundable.`;
        }
        customNotice.style.display = "block";
      }
    } else {
      // Hide custom notice when standard option is selected
      const customNotice = optEl.querySelector(".pfd-custom-notice");
      if (customNotice) {
        customNotice.style.display = "none";
      }
      // Remove active state from dropdown button when standard option is selected
      const customDropdownButton = optEl.querySelector(".pfd-custom-dropdown");
      if (customDropdownButton) {
        customDropdownButton.classList.remove("is--selected");
      }
    }

    // Update our internal state if PFD is initialized
    if (window.__PFD && window.__PFD.selectedValues) {
      window.__PFD.selectedValues[optionIndex] = normVal(value);

      // Resolve variant and update select
      const variantId = resolveVariantFromValues(window.__PFD.selectedValues);
      if (variantId && window.__PFD.selectEl) {
        // Update HTML data attributes with correct variant info before changing select
        const variant = window.__PFD.variantById.get(variantId);
        if (variant) {
          const selectedOption = window.__PFD.selectEl.querySelector(
            `option[value="${variantId}"]`,
          );
          if (selectedOption) {
            // Update HTML data attributes that the theme actually checks
            selectedOption.setAttribute(
              "data-incoming",
              variant.incoming || "false",
            );
            selectedOption.setAttribute(
              "data-nextincomingdate",
              variant.nextIncomingDate || "",
            );
            selectedOption.setAttribute(
              "data-inventorypolicy",
              variant.inventoryPolicy || "deny",
            );
            selectedOption.setAttribute(
              "data-inventoryquantity",
              variant.inventoryQuantity || (variant.available ? "999" : "0"),
            );
          }
        }

        window.__PFD.selectEl.value = variantId;
        window.__PFD.selectEl.dispatchEvent(
          new Event("change", { bubbles: true }),
        );
      }

      // Update availability
      if (typeof patchAllAvailability === "function") {
        patchAllAvailability();
      }
    } else {
      // Fallback: find the select and update it directly
      const form = swatchItem.closest("form, .t4s-form__product");
      const selectEl = form?.querySelector('select[name="id"]');
      if (selectEl) {
        // Get all selected values and find matching variant
        const allOptions = form.querySelectorAll("[data-swatch-option]");
        const selectedValues = [];

        allOptions.forEach((opt) => {
          const idx = Number(opt.getAttribute("data-id"));
          const selected = opt.querySelector("[data-swatch-item].is--selected");
          selectedValues[idx] = selected
            ? normVal(selected.getAttribute("data-value") || "")
            : "";
        });

        // Find matching option in select
        const options = selectEl.querySelectorAll("option");
        for (const option of options) {
          const optionMatches = selectedValues.every((val, idx) => {
            if (!val) return true;
            const optionVal =
              option.getAttribute(`data-option${idx + 1}`) || "";
            return normVal(optionVal) === val;
          });

          if (optionMatches) {
            selectEl.value = option.value;
            selectEl.dispatchEvent(new Event("change", { bubbles: true }));
            break;
          }
        }
      }
    }

    // Manually trigger the thumbnail update functionality that the theme expects
    // This replicates the jQuery code from main-product.liquid lines 5489+
    if (typeof $ !== "undefined") {
      setTimeout(() => {
        triggerThumbnailUpdate();
      }, 100);
    }
  }

  // Manual thumbnail update function to maintain existing functionality
  function triggerThumbnailUpdate() {
    if (typeof $ === "undefined") return;

    setTimeout(function () {
      var sel_var_id = $(
        '.t4s-product-form__variants select[name="id"] option:selected',
      ).val();

      if (!sel_var_id) {
        return;
      }

      var sel_images = $(
        ".pfd-variant-images .pfd-main-imgs .pfd-img-listing[data-pfd-variant-id='" +
          sel_var_id +
          "']",
      ).html();
      var sel_thumb_img = $(
        ".pfd-variant-images .pfd-thumb-imgs .pfd-img-listing[data-pfd-variant-id='" +
          sel_var_id +
          "']",
      ).html();
      var data_var_img = $(
        ".pfd-variant-images .pfd-main-imgs .pfd-img-listing[data-pfd-variant-id='" +
          sel_var_id +
          "']",
      ).attr("data-var-img");

      // Check if we have variant images or just a single image
      var mediaItemCount = 0;
      if (sel_images && sel_images.trim() !== "") {
        mediaItemCount = $(sel_images).filter(".pfd-media-item").length;
      }

      var hasMultipleImages = mediaItemCount > 1;

      // Always show the main slider container and ensure it's visible
      $(".t4s-product__media-wrapper .slider_sec_main")
        .show()
        .css("opacity", "1");
      $(".slick_gallery").hide();

      if (!hasMultipleImages && data_var_img) {
        // Single variant image: replace slider content with the variant image
        $(".slider_sec_main").html("<img src='" + data_var_img + "' />");
      }
    }, 100);
  }

  // Initialize swatch override immediately
  setupSwatchOverride();

  const root = document.querySelector(".t4s-product-form__variants");
  if (!root) return;

  const selectEl = root.querySelector('select[name="id"]');
  const variantsJsonEl = root.querySelector("script.pr_variants_json");
  const optionsJsonEl = root.querySelector("script.pr_options_json");

  if (!selectEl || !variantsJsonEl || !optionsJsonEl) {
    console.warn("[PFD] Missing required elements");
    return;
  }

  const normName = (s) =>
    String(s ?? "")
      .trim()
      .toLowerCase();
  const normVal = (s) => String(s ?? "").trim();
  const keyFromValues = (values) => values.map(normVal).join("||");

  // Helper function to get display value (only strips quotes for display purposes)
  const getDisplayValue = (rawValue, optionUnit = "") => {
    const cleanedValue = rawValue.replace(/"/g, "");
    return optionUnit ? `${cleanedValue} ${optionUnit}` : cleanedValue;
  };

  const getSwatchOptions = () => [
    ...root.querySelectorAll("[data-swatch-option]"),
  ];

  const getSwatchItems = (optionIndex) => {
    const optEl = getSwatchOptions().find(
      (el) => Number(el.getAttribute("data-id")) === optionIndex,
    );
    if (!optEl) return { optEl: null, items: [] };
    return {
      optEl,
      items: [...optEl.querySelectorAll("[data-swatch-item]")],
    };
  };

  // ----- parse bootstrap -----
  let initialVariants = [];
  let options = [];

  try {
    initialVariants = JSON.parse(variantsJsonEl.textContent || "[]");
  } catch (e) {
    console.warn("[PFD] Bad pr_variants_json", e);
  }

  try {
    options = JSON.parse(optionsJsonEl.textContent || "[]");
  } catch (e) {
    console.warn("[PFD] Bad pr_options_json", e);
  }

  const optionCount = Math.max(1, options.length || 0);

  // ----- state -----
  // Build maps from BOTH theme JSON and Storefront hydration (same shape)
  const variantById = new Map(); // id -> {id, available, option1..N}
  const idByKey = new Map(); // "v1||v2||v3" -> id
  const selectedValues = Array(optionCount).fill("");

  // Initialize theme variant array reference
  if (!window.__PFD_VARIANTS__) {
    window.__PFD_VARIANTS__ = [];
  }

  // Keep debug available and expose select element
  window.__PFD = { variantById, idByKey, selectedValues, options, selectEl };

  function resolveVariantFromValues(selectedValues) {
    if (!idByKey || !selectedValues) return null;
    return idByKey.get(keyFromValues(selectedValues));
  }

  function upsertVariant(v) {
    const id = String(v.id);
    variantById.set(id, v);
    if (id === "51236621975869") {
      console.log("HERE", variantById.get(id));
    }

    const values = [];
    for (let i = 0; i < optionCount; i++)
      values.push(v[`option${i + 1}`] ?? "");
    idByKey.set(keyFromValues(values), id);

    // Update theme's variant array
    updateThemeVariantArray(v, v._productRequiresSellingPlan);
  }

  // Function to build theme-compatible variant object
  function buildThemeVariant(rawVariant, productRequiresSellingPlan = false) {
    // If variant already has full theme data, preserve it and just add PFD fields
    if (rawVariant.title && rawVariant.name && rawVariant.public_title) {
      return {
        ...rawVariant, // Preserve all existing theme fields
        // Ensure PFD-specific fields are included
        imageUrl: rawVariant.imageUrl,
        variantImages: rawVariant.variantImages || [],
      };
    }

    // For variants that need theme format building
    const optionValues = [
      rawVariant.option1,
      rawVariant.option2,
      rawVariant.option3,
    ].filter(Boolean);
    const titleFromOptions = optionValues.join(" / ");

    return {
      id: Number(rawVariant.id),
      title: rawVariant.title || titleFromOptions,
      option1: rawVariant.option1 || null,
      option2: rawVariant.option2 || null,
      option3: rawVariant.option3 || null,
      sku: rawVariant.sku || null,
      requires_shipping: rawVariant.requires_shipping !== false,
      taxable: rawVariant.taxable !== false,
      featured_image:
        rawVariant.featured_image ||
        (rawVariant.imageUrl ? { src: rawVariant.imageUrl } : null),
      available: rawVariant.available,
      name: rawVariant.name || rawVariant.title || titleFromOptions,
      public_title: rawVariant.public_title || titleFromOptions,
      options: rawVariant.options || optionValues,
      price: rawVariant.price || 0,
      weight: rawVariant.weight || 0,
      compare_at_price: rawVariant.compare_at_price || null,
      inventory_management: rawVariant.inventory_management || "shopify",
      barcode: rawVariant.barcode || "",
      featured_media: rawVariant.featured_media || null,
      requires_selling_plan:
        rawVariant.requires_selling_plan !== undefined
          ? rawVariant.requires_selling_plan
          : productRequiresSellingPlan,
      selling_plan_allocations: rawVariant.selling_plan_allocations || [],
      quantity_rule: rawVariant.quantity_rule || {
        min: 1,
        max: null,
        increment: 1,
      },
      incoming: rawVariant.incoming || false,
      next_incoming_date: rawVariant.next_incoming_date || null,
      inventory_policy: rawVariant.inventory_policy || null,
      inventory_quantity: rawVariant.inventory_quantity || 0,
      // Preserve PFD-specific data
      imageUrl: rawVariant.imageUrl,
      variantImages: rawVariant.variantImages || [],
    };
  }

  // Function to populate theme's variant array with variant data
  function updateThemeVariantArray(
    variant,
    productRequiresSellingPlan = false,
  ) {
    if (!window.__PFD_VARIANTS__) {
      window.__PFD_VARIANTS__ = [];
    }

    const existingIndex = window.__PFD_VARIANTS__.findIndex(
      (v) => String(v.id) === String(variant.id),
    );

    const themeVariant = buildThemeVariant(variant, productRequiresSellingPlan);

    if (existingIndex >= 0) {
      // Update existing variant
      window.__PFD_VARIANTS__[existingIndex] = themeVariant;
    } else {
      // Add new variant
      window.__PFD_VARIANTS__.push(themeVariant);
    }
  }

  for (const v of initialVariants) {
    // Extract image URL from variant data
    let imageUrl = null;
    if (v.featured_image && v.featured_image.src) {
      imageUrl = v.featured_image.src;
    } else if (
      v.featured_media &&
      v.featured_media.preview_image &&
      v.featured_media.preview_image.src
    ) {
      imageUrl = v.featured_media.preview_image.src;
    }

    // Preserve all existing theme variant data and add PFD-specific fields
    upsertVariant({
      ...v,
      available: !!v.available,
      imageUrl: imageUrl,
      variantImages: imageUrl ? [imageUrl] : [],
    });
  }

  function getSelectedFromDOM() {
    const values = Array(optionCount).fill("");
    for (const optEl of getSwatchOptions()) {
      const idx = Number(optEl.getAttribute("data-id"));
      if (Number.isNaN(idx)) continue;

      const selectedItem = optEl.querySelector(
        "[data-swatch-item].is--selected",
      );
      if (selectedItem)
        values[idx] = normVal(selectedItem.getAttribute("data-value") || "");
    }
    return values;
  }

  function resolveVariantId(values) {
    return idByKey.get(keyFromValues(values));
  }

  // IMPORTANT: do NOT dispatch change unless variant truly changed
  let lastAppliedVariantId = null;
  function applyVariantToSelect(variantId) {
    if (!variantId) return;
    const nextId = String(variantId);
    if (lastAppliedVariantId === nextId) return;

    lastAppliedVariantId = nextId;
    selectEl.value = nextId;

    // Ensure DOM exists for this variant before theme processes it
    ensureDOMForVariant(nextId);

    // Let theme update its own UI
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Progressive prefix matching for availability
  function variantMatchesPrefix(v, optionIndex) {
    for (let i = 0; i < optionIndex; i++) {
      const sel = normVal(selectedValues[i]);
      if (!sel) continue;
      if (normVal(v[`option${i + 1}`] ?? "") !== sel) return false;
    }
    return true;
  }

  // Visual "sold out marker" handling:
  // We only toggle the visual class but keep items clickable
function setSoldOut(el, isSoldOut) {
  el.classList.toggle("is--soldout", isSoldOut);
  el.classList.toggle("is--out-of-stock", isSoldOut);
  
  // Find the correct parent for the badge (image container if exists)
  const imgContainer = el.querySelector("[data-img-el]");
  const badgeParent = imgContainer || el;
  
  if (isSoldOut) {
    el.setAttribute("aria-disabled", "true");
    el.dataset.available = "false";
    
    // Create badge if doesn't exist
    let badge = badgeParent.querySelector(".t4s-swatch__restock-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "t4s-swatch__restock-badge";
      badge.textContent = "Awaiting Restock";
      badgeParent.appendChild(badge);
      
      // Run luminance detection if inside image container
      if (imgContainer) {
        detectSwatchLuminance(imgContainer, badge);
      }
    }
    // Class-based visibility (works with CSS !important)
    badge.classList.add("is-visible");
  } else {
    el.removeAttribute("aria-disabled");
    el.dataset.available = "true";
    
    // Find and hide badge
    const badge = badgeParent.querySelector(".t4s-swatch__restock-badge");
    if (badge) {
      badge.classList.remove("is-visible");
    }
  }
}

// Luminance detection for content-aware badge contrast
const luminanceCache = new Map();

function detectSwatchLuminance(imgContainer, badge) {
  const img = imgContainer.querySelector("img");
  if (!img || !img.src || img.src === "" || img.src === "null") {
    console.log("[Luminance] No valid image found, defaulting to dark");
    imgContainer.setAttribute("data-luminance", "dark");
    return;
  }
  
  // Check cache first
  if (luminanceCache.has(img.src)) {
    const cached = luminanceCache.get(img.src);
    console.log("[Luminance] Using cached result:", cached, "for", img.src.split("/").pop());
    imgContainer.setAttribute("data-luminance", cached);
    return;
  }
  
  // Wait for image to load if needed
  const analyze = () => {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = 20;
      canvas.height = 20;
      
      ctx.drawImage(img, 0, 0, 20, 20);
      const imageData = ctx.getImageData(0, 0, 20, 20).data;
      
      let totalLuminance = 0;
      const pixelCount = imageData.length / 4;
      
      for (let i = 0; i < imageData.length; i += 4) {
        // Perceived luminance formula: 0.299R + 0.587G + 0.114B
        const luminance = 0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2];
        totalLuminance += luminance;
      }
      
      const avgLuminance = totalLuminance / pixelCount;
      const result = avgLuminance > 128 ? "light" : "dark";
      
      // DEBUG: Log the calculation results
      console.log("[Luminance] Image:", img.src.split("/").pop(), "| Avg:", avgLuminance.toFixed(1), "| Result:", result);
      
      luminanceCache.set(img.src, result);
      imgContainer.setAttribute("data-luminance", result);
    } catch (e) {
      // DEBUG: Log CORS or other errors
      console.error("[Luminance] Error analyzing image:", e.message, "| Image:", img.src);
      imgContainer.setAttribute("data-luminance", "dark");
    }
  };
  
  if (img.complete && img.naturalWidth > 0) {
    analyze();
  } else {
    img.addEventListener("load", analyze, { once: true });
    img.addEventListener("error", () => {
      console.error("[Luminance] Image failed to load:", img.src);
      imgContainer.setAttribute("data-luminance", "dark");
    }, { once: true });
  }
}



// Check if an option is a Color option based on the option name
function isColorOption(optionIndex) {
  const optionName = normName(options?.[optionIndex]?.name || "");
  return optionName === "color" || optionName === "colour";
}

function patchAvailabilityForOption(optionIndex) {
  const { items } = getSwatchItems(optionIndex);
  if (!items.length) return;

  const availableByValue = new Map();
  const isColor = isColorOption(optionIndex);

  // Use selectedValues array directly instead of reading from DOM
  // This ensures we have the most up-to-date selection state
  // (especially important after click handlers update selectedValues)
  const currentSelection = [...selectedValues];

  if (isColor) {
    // For Color options: only show sold-out if the specific combination is sold out

    for (const v of variantById.values()) {
      if (!v || !v.available) continue;

      // Check if variant matches all currently selected options
      let matches = true;
      for (let i = 0; i < optionCount; i++) {
        // Ignore the current option being evaluated
        if (i === optionIndex) continue;

        const selectedVal = normVal(currentSelection[i] || "");
        const variantVal = normVal(v[`option${i + 1}`] || "");

        if (selectedVal && selectedVal !== variantVal) {
          matches = false;
          break;
        }
      }

      if (!matches) continue;

      const val = normVal(v[`option${optionIndex + 1}`] ?? "");
      if (val) availableByValue.set(val, true);
    }

    // Check if we have any variants for this option with current selections
    const hasAnyVariantsForOption = [...variantById.values()].some((v) => {
      if (!v) return false;

      let matches = true;
      for (let i = 0; i < optionIndex; i++) {
        const selectedVal = normVal(currentSelection[i] || "");
        const variantVal = normVal(v[`option${i + 1}`] || "");
        if (selectedVal && selectedVal !== variantVal) {
          matches = false;
          break;
        }
      }

      if (!matches) return false;
      const val = normVal(v[`option${optionIndex + 1}`] ?? "");
      return !!val;
    });

    if (!hasAnyVariantsForOption) {
      for (const item of items) setSoldOut(item, false);
      return;
    }
  } else {
    // For non-Color options: only show sold-out if ALL variants with that value are sold out
    for (const v of variantById.values()) {
      if (!v || !v.available) continue;

      const val = normVal(v[`option${optionIndex + 1}`] ?? "");
      if (val) availableByValue.set(val, true);
    }

    // Check if we have any variants for this option at all
    const hasAnyVariantsForOption = [...variantById.values()].some((v) => {
      if (!v) return false;
      const val = normVal(v[`option${optionIndex + 1}`] ?? "");
      return !!val;
    });

    if (!hasAnyVariantsForOption) {
      for (const item of items) setSoldOut(item, false);
      return;
    }
  }

  let availableCount = 0;
  let soldOutCount = 0;

  for (const item of items) {
    const val = normVal(item.getAttribute("data-value") || "");
    const isAvailable = availableByValue.get(val) === true;

    setSoldOut(item, !isAvailable);

    if (isAvailable) {
      availableCount++;
    } else {
      soldOutCount++;
    }
  }
}


  function patchAllAvailability() {
    // Sync selectedValues with current DOM state before patching availability
    const domSelected = getSelectedFromDOM();
    for (let i = 0; i < optionCount; i++) {
      selectedValues[i] = domSelected[i];
    }

    for (let i = 0; i < optionCount; i++) patchAvailabilityForOption(i);
  }

  function updateSwatchImages() {
    // Update swatch items with variant image data
    const swatchItems = root.querySelectorAll("[data-swatch-item]");

    for (const item of swatchItems) {
      const optionEl = item.closest("[data-swatch-option]");
      if (!optionEl) continue;

      const optionIndex = Number(optionEl.getAttribute("data-id"));
      const itemValue = normVal(item.getAttribute("data-value") || "");

      if (Number.isNaN(optionIndex) || !itemValue) continue;

      // Find variants that match this option value at this position
      const matchingVariants = [...variantById.values()].filter((v) => {
        const variantValue = normVal(v[`option${optionIndex + 1}`] || "");
        return variantValue === itemValue;
      });

      // Use the first matching variant's image (prioritizing available variants)
      const preferredVariant =
        matchingVariants.find((v) => v.available && v.imageUrl) ||
        matchingVariants.find((v) => v.imageUrl);

      const imgEl =
        item.querySelector("[data-img-el] img") || item.querySelector("img");
      if (imgEl) {
        if (preferredVariant && preferredVariant.imageUrl) {
          item.setAttribute("data-var-img", preferredVariant.imageUrl);
          setupSwatchImageLoad(imgEl, preferredVariant.imageUrl, item);
        } else {
          // No image available, show placeholder
          item.classList.add("swatch-placeholder");
          imgEl.src = "";
        }
      }
    }
  }

  function setupSwatchImageLoad(imgEl, imageUrl, swatchItem) {
    // Add loading state
    swatchItem.classList.add("swatch-loading");
    swatchItem.classList.remove(
      "swatch-loaded",
      "swatch-error",
      "swatch-placeholder",
    );

    // Handle load success
    imgEl.onload = function () {
      swatchItem.classList.remove("swatch-loading", "swatch-placeholder");
      swatchItem.classList.add("swatch-loaded");
    };

    // Handle load error
    imgEl.onerror = function () {
      swatchItem.classList.remove("swatch-loading");
      swatchItem.classList.add("swatch-error", "swatch-placeholder");
      imgEl.src = "";
    };

    // Set the image source to trigger loading
    imgEl.src = imageUrl;
  }

  function updateVariantImages() {
    // Hide any legacy variant image containers to ensure only our implementation is used
    const legacyContainers = root.querySelectorAll(".varin_imgaes");
    legacyContainers.forEach((container) => {
      container.style.display = "none !important";
    });

    // Update the .pfd-variant-images sections with correct variant image data
    const varinImagesEl = root.querySelector(".pfd-variant-images");
    if (!varinImagesEl) return;

    const mainImgsEl = varinImagesEl.querySelector(".pfd-main-imgs");
    const thumbImgsEl = varinImagesEl.querySelector(".pfd-thumb-imgs");

    let createdCount = 0;
    let updatedCount = 0;

    // Process all variants in our map
    for (const [variantId, variant] of variantById.entries()) {
      if (!variant) continue;

      // Handle main images
      if (mainImgsEl) {
        let mainListing = mainImgsEl.querySelector(
          `.pfd-img-listing[data-pfd-variant-id="${variantId}"]`,
        );

        // Create main listing if it doesn't exist
        if (!mainListing) {
          mainListing = document.createElement("div");
          mainListing.className = "pfd-img-listing";
          mainListing.setAttribute("data-pfd-variant-id", variantId);
          mainListing.setAttribute("data-var-img", variant.imageUrl || "");
          mainImgsEl.appendChild(mainListing);
          createdCount++;

          // Populate with images only when creating new
          const imagesToUse =
            variant.variantImages && variant.variantImages.length > 0
              ? variant.variantImages
              : variant.imageUrl
                ? [variant.imageUrl]
                : [];

          for (const imageUrl of imagesToUse) {
            const mediaItem = document.createElement("div");
            mediaItem.className = "pfd-media-item";
            const img = document.createElement("img");
            img.src = imageUrl;
            mediaItem.appendChild(img);
            mainListing.appendChild(mediaItem);
          }
        } else {
          // Update existing DOM element with hydrated image data
          updatedCount++;

          // Clear existing content and repopulate with hydrated data
          mainListing.innerHTML = "";
          mainListing.setAttribute("data-var-img", variant.imageUrl || "");

          const imagesToUse =
            variant.variantImages && variant.variantImages.length > 0
              ? variant.variantImages
              : variant.imageUrl
                ? [variant.imageUrl]
                : [];

          for (const imageUrl of imagesToUse) {
            const mediaItem = document.createElement("div");
            mediaItem.className = "pfd-media-item";
            const img = document.createElement("img");
            img.src = imageUrl;
            mediaItem.appendChild(img);
            mainListing.appendChild(mediaItem);
          }
        }
      }

      // Handle thumbnail images
      if (thumbImgsEl) {
        let thumbListing = thumbImgsEl.querySelector(
          `.pfd-img-listing[data-pfd-variant-id="${variantId}"]`,
        );

        // Create thumb listing if it doesn't exist (for hydrated variants)
        if (!thumbListing) {
          thumbListing = document.createElement("div");
          thumbListing.className = "pfd-img-listing";
          thumbListing.setAttribute("data-pfd-variant-id", variantId);
          thumbImgsEl.appendChild(thumbListing);

          // Populate with thumbnails only when creating new
          const imagesToUse =
            variant.variantImages && variant.variantImages.length > 0
              ? variant.variantImages
              : variant.imageUrl
                ? [variant.imageUrl]
                : [];

          for (const imageUrl of imagesToUse) {
            const mediaThumb = document.createElement("div");
            mediaThumb.className = "pfd-media-thumb";
            const imgDiv = document.createElement("div");
            imgDiv.className = "pfd-img";
            imgDiv.style.backgroundImage = `url('${imageUrl}')`;
            mediaThumb.appendChild(imgDiv);
            thumbListing.appendChild(mediaThumb);
          }
        } else {
          // Update existing thumb DOM element with hydrated image data

          // Clear existing content and repopulate with hydrated data
          thumbListing.innerHTML = "";

          const imagesToUse =
            variant.variantImages && variant.variantImages.length > 0
              ? variant.variantImages
              : variant.imageUrl
                ? [variant.imageUrl]
                : [];

          for (const imageUrl of imagesToUse) {
            const mediaThumb = document.createElement("div");
            mediaThumb.className = "pfd-media-thumb";
            const imgDiv = document.createElement("div");
            imgDiv.className = "pfd-img";
            imgDiv.style.backgroundImage = `url('${imageUrl}')`;
            mediaThumb.appendChild(imgDiv);
            thumbListing.appendChild(mediaThumb);
          }
        }
      }
    }
  }

  // Listen for variant changes to ensure DOM is updated
  function ensureDOMForVariant(variantId) {
    const variant = variantById.get(variantId);
    if (!variant || !variant.variantImages) return;

    const varinImagesEl = root.querySelector(".pfd-variant-images");
    if (!varinImagesEl) return;

    const mainImgsEl = varinImagesEl.querySelector(".pfd-main-imgs");
    const thumbImgsEl = varinImagesEl.querySelector(".pfd-thumb-imgs");

    // Ensure main listing exists
    if (mainImgsEl) {
      let mainListing = mainImgsEl.querySelector(
        `.pfd-img-listing[data-pfd-variant-id="${variantId}"]`,
      );

      if (!mainListing) {
        mainListing = document.createElement("div");
        mainListing.className = "pfd-img-listing";
        mainListing.setAttribute("data-pfd-variant-id", variantId);
        mainListing.setAttribute("data-var-img", variant.imageUrl || "");
        mainImgsEl.appendChild(mainListing);

        // Populate with images
        for (const imageUrl of variant.variantImages) {
          const mediaItem = document.createElement("div");
          mediaItem.className = "pfd-media-item";
          const img = document.createElement("img");
          img.src = imageUrl;
          mediaItem.appendChild(img);
          mainListing.appendChild(mediaItem);
        }
      }
    }

    // Ensure thumb listing exists
    if (thumbImgsEl) {
      let thumbListing = thumbImgsEl.querySelector(
        `.pfd-img-listing[data-pfd-variant-id="${variantId}"]`,
      );

      if (!thumbListing) {
        thumbListing = document.createElement("div");
        thumbListing.className = "pfd-img-listing";
        thumbListing.setAttribute("data-pfd-variant-id", variantId);
        thumbImgsEl.appendChild(thumbListing);

        // Populate with thumbnails
        for (const imageUrl of variant.variantImages) {
          const mediaThumb = document.createElement("div");
          mediaThumb.className = "pfd-media-thumb";
          const imgDiv = document.createElement("div");
          imgDiv.className = "pfd-img";
          imgDiv.style.backgroundImage = `url('${imageUrl}')`;
          mediaThumb.appendChild(imgDiv);
          thumbListing.appendChild(mediaThumb);
        }
      }
    }
  }

  // Ensure select option exists for hydrated variants
  function ensureSelectOption(variantId, variant) {
    if (selectEl.querySelector(`option[value="${variantId}"]`)) return;

    const option = document.createElement("option");
    option.value = variantId;
    option.setAttribute("data-option1", variant.option1 || "");
    option.setAttribute("data-option2", variant.option2 || "");

    const optionValues = [
      variant.option1,
      variant.option2,
      variant.option3,
    ].filter(Boolean);
    option.textContent = optionValues.join(" / ");

    if (!variant.available) option.disabled = true;

    selectEl.appendChild(option);
  }

  // ---------- PFD Click handling (backup for our override) ----------
  function handlePFDSwatchClick(item) {
    const optEl = item.closest("[data-swatch-option]");
    if (!optEl) return;

    const optionIndex = Number(optEl.getAttribute("data-id"));
    if (Number.isNaN(optionIndex)) return;

    // preserve current selections (prevents "reset to 14")
    const domSelected = getSelectedFromDOM();
    for (let i = 0; i < optionCount; i++) {
      if (!selectedValues[i] && domSelected[i])
        selectedValues[i] = domSelected[i];
    }

    const value = normVal(item.getAttribute("data-value") || "");
    selectedValues[optionIndex] = value;

    // Handle split selection - clear selections from both standard and custom areas
    if (optEl.classList.contains("pfd-split-option")) {
      optEl
        .querySelectorAll("[data-swatch-item].is--selected")
        .forEach((el) => el.classList?.remove("is--selected"));

      // Check if this swatch item is from the custom options area
      const isFromCustomDropdown = item.closest(".pfd-custom-options");

      if (!isFromCustomDropdown) {
        // Reset custom dropdown to default state when selecting standard option
        const customDropdown = optEl.querySelector(
          ".pfd-custom-dropdown [data-current-value]",
        );
        if (customDropdown) {
          const optionName = optEl.getAttribute("data-option-name") || "";
          customDropdown.textContent = `Custom ${optionName.toLowerCase()}`;
        }

        // Hide custom notice when standard option is selected
        const customNotice = optEl.querySelector(".pfd-custom-notice");
        if (customNotice) {
          customNotice.style.display = "none";
        }
      }
    } else {
      // Standard handling for non-split options
      optEl
        .querySelectorAll("[data-swatch-item].is--selected")
        .forEach((el) => el.classList?.remove("is--selected"));
    }

    item.classList.add("is--selected");

    // Update current value display - handle both Color and Non-Color structures
    const valueFromItem = item.getAttribute("data-value") || "";
    const optionUnit = optEl.getAttribute("data-option-unit") || "";
    const displayValue = getDisplayValue(valueFromItem, optionUnit);

    // Check if this is a custom option to add badge
    const isFromCustomDropdown = item.closest(".pfd-custom-options");

    let titleElement = optEl.querySelector(".t4s-swatch__title--right .bold");
    if (titleElement) {
      // Non-Color section structure
      titleElement.textContent = displayValue;
    } else {
      // Color section structure - use the wrapper span
      titleElement = optEl.querySelector(".t4s-selected-value");
      if (titleElement) {
        titleElement.textContent = displayValue;
      }
    }

    // Update custom dropdown display for selected custom options
    if (isFromCustomDropdown) {
      const customDropdown = optEl.querySelector(
        ".pfd-custom-dropdown [data-current-value]",
      );
      if (customDropdown) {
        customDropdown.innerHTML = `${displayValue} <span class="pfd-custom-badge">Custom</span>`;
      }

      // Show custom notice and update text
      const customNotice = optEl.querySelector(".pfd-custom-notice");
      if (customNotice) {
        const optionName = optEl.getAttribute("data-option-name") || "item";
        const noticeText = customNotice.querySelector(
          ".pfd-custom-notice-text",
        );
        if (noticeText) {
          noticeText.innerHTML = `Custom ${optionName.toLowerCase()}s are <strong>made to order</strong>. Please allow <span class="pfd-custom-notice-highlight">6-8 weeks</span> for delivery. Custom orders are non-cancellable/refundable.`;
        }
        customNotice.style.display = "block";
      }
    } else {
      // Hide custom notice when standard option is selected
      const customNotice = optEl.querySelector(".pfd-custom-notice");
      if (customNotice) {
        customNotice.style.display = "none";
      }
    }

    // resolve full variant and apply to select
    const variantId = resolveVariantId(selectedValues);
    if (variantId) {
      // Update HTML data attributes with correct variant info before applying variant
      const variant = window.__PFD
        ? window.__PFD.variantById.get(variantId)
        : null;
      if (variant) {
        const selectEl = item
          .closest("form, .t4s-form__product")
          ?.querySelector('select[name="id"]');
        const selectedOption = selectEl?.querySelector(
          `option[value="${variantId}"]`,
        );
        if (selectedOption) {
          // Update HTML data attributes that the theme actually checks
          selectedOption.setAttribute(
            "data-incoming",
            variant.incoming || "false",
          );
          selectedOption.setAttribute(
            "data-nextincomingdate",
            variant.nextIncomingDate || "",
          );
          selectedOption.setAttribute(
            "data-inventorypolicy",
            variant.inventoryPolicy || "deny",
          );
          selectedOption.setAttribute(
            "data-inventoryquantity",
            variant.inventoryQuantity || (variant.available ? "999" : "0"),
          );
        }
      }

      // Ensure DOM exists before applying variant
      ensureDOMForVariant(variantId);
      applyVariantToSelect(variantId);
    }

    // re-patch sold-out
    patchAllAvailability();
  }

  // Make function available globally for our override
  window.handlePFDSwatchClick = handlePFDSwatchClick;

  // Setup split selection dropdown handlers
  function setupSplitSelectionHandlers() {
    document.addEventListener("click", function (e) {
      // Handle custom dropdown item selection
      const dropdownItem = e.target.closest(
        "[data-swatch-item][data-dropdown-off]",
      );
      if (dropdownItem && dropdownItem.closest(".pfd-custom-options")) {
        e.preventDefault();
        e.stopPropagation();

        const value = dropdownItem.getAttribute("data-value") || "";
        const cleanedValue = getDisplayValue(value);

        // Find the custom dropdown button
        const dropdownWrapper = dropdownItem.closest(".t4s-dropdown__wrapper");
        if (dropdownWrapper) {
          const dropdownId = dropdownWrapper.id;
          const customButton = document.querySelector(
            `[data-pfd-dropdown-open][data-id="${dropdownId}"]`,
          );

          if (customButton) {
            // Update the dropdown button text to show the selected value
            const currentValueSpan = customButton.querySelector(
              "[data-current-value]",
            );
            if (currentValueSpan) {
              // Get the option unit from the parent option element
              const optionEl = dropdownItem.closest("[data-swatch-option]");
              const optionUnit = optionEl
                ? optionEl.getAttribute("data-option-unit") || ""
                : "";

              // Display the value with unit if available
              const displayValue = optionUnit
                ? `${cleanedValue} ${optionUnit}`
                : cleanedValue;

              currentValueSpan.innerHTML = `${displayValue} <span class="pfd-custom-badge">Custom</span>`;
            }

            // Close the dropdown
            dropdownWrapper.classList.remove("is-open");
            customButton.setAttribute("aria-expanded", "false");
          }

          // Show custom notice for dropdown selection and update text
          const optionEl = dropdownItem.closest("[data-swatch-option]");
          const customNotice = optionEl
            ? optionEl.querySelector(".pfd-custom-notice")
            : null;
          if (customNotice && optionEl) {
            const optionName =
              optionEl.getAttribute("data-option-name") || "item";
            const noticeText = customNotice.querySelector(
              ".pfd-custom-notice-text",
            );
            if (noticeText) {
              noticeText.innerHTML = `Custom ${optionName.toLowerCase()}s are <strong>made to order</strong>. Please allow <span class="pfd-custom-notice-highlight">6-8 weeks</span> for delivery.`;
            }
            customNotice.style.display = "block";
          }

          // Clear all selected states from the option group (both standard and custom)
          if (optionEl && optionEl.classList.contains("pfd-split-option")) {
            optionEl
              .querySelectorAll("[data-swatch-item].is--selected")
              .forEach((el) => el.classList?.remove("is--selected"));

            // Remove active state from ALL dropdown buttons in this option group
            optionEl
              .querySelectorAll(".pfd-custom-dropdown")
              .forEach((btn) => btn.classList?.remove("is--selected"));
          }

          // Add active state to THIS dropdown button
          if (customButton) {
            customButton.classList.add("is--selected");
          }
        }

        // Trigger the standard swatch selection logic
        handleCustomSwatchClick(dropdownItem, e);
        return;
      }

      // Handle custom dropdown clicks
      const customDropdown = e.target.closest("[data-pfd-dropdown-open]");
      if (customDropdown) {
        e.preventDefault();
        e.stopPropagation();

        const dropdownId = customDropdown.getAttribute("data-id");
        const dropdownWrapper = document.getElementById(dropdownId);

        if (dropdownWrapper) {
          const isOpen = dropdownWrapper.classList.contains("is-open");

          // Close all PFD dropdowns first
          document
            .querySelectorAll(
              ".pfd-custom-options .t4s-dropdown__wrapper.is-open",
            )
            .forEach((wrapper) => wrapper.classList?.remove("is-open"));

          // Toggle current dropdown
          if (!isOpen) {
            dropdownWrapper.classList.add("is-open");
            customDropdown.setAttribute("aria-expanded", "true");
          } else {
            customDropdown.setAttribute("aria-expanded", "false");
          }
        }

        return;
      }

      // Close dropdowns when clicking outside
      if (
        !e.target.closest(".pfd-custom-options") &&
        !e.target.closest(".t4s-dropdown__wrapper")
      ) {
        document
          .querySelectorAll(
            ".pfd-custom-options .t4s-dropdown__wrapper.is-open",
          )
          .forEach((wrapper) => {
            wrapper.classList?.remove("is-open");
            const customButton = document.querySelector(
              `[data-pfd-dropdown-open][data-id="${wrapper.id}"]`,
            );
            if (customButton) {
              customButton.setAttribute("aria-expanded", "false");
            }
          });
      }
    });

    // Handle keyboard navigation for dropdowns
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        document
          .querySelectorAll(
            ".pfd-custom-options .t4s-dropdown__wrapper.is-open",
          )
          .forEach((wrapper) => {
            wrapper.classList?.remove("is-open");
            const customButton = document.querySelector(
              `[data-pfd-dropdown-open][data-id="${wrapper.id}"]`,
            );
            if (customButton) {
              customButton.setAttribute("aria-expanded", "false");
              customButton.focus();
            }
          });
      }
    });
  }

  // Initialize split selection handlers
  setupSplitSelectionHandlers();

  // ---------- Bootstrap selection ----------
  const domSelected = getSelectedFromDOM();
  for (let i = 0; i < optionCount; i++)
    selectedValues[i] = domSelected[i] || "";
  patchAllAvailability();

  // Initial image update with any existing data
  updateSwatchImages();
  updateVariantImages();

  // Show custom notice on page load if custom option is already selected
  setTimeout(() => {
    const swatchOptions = document.querySelectorAll("[data-swatch-option]");
    swatchOptions.forEach((optEl) => {
      const selectedCustomItem = optEl.querySelector(
        ".pfd-custom-options [data-swatch-item].is--selected",
      );
      const customNotice = optEl.querySelector(".pfd-custom-notice");
      const customDropdownButton = optEl.querySelector(".pfd-custom-dropdown");

      if (selectedCustomItem && customNotice) {
        const optionName = optEl.getAttribute("data-option-name") || "item";
        const noticeText = customNotice.querySelector(
          ".pfd-custom-notice-text",
        );
        if (noticeText) {
          noticeText.innerHTML = `Custom ${optionName.toLowerCase()}s are <strong>made to order</strong>. Please allow <span class="pfd-custom-notice-highlight">6-8 weeks</span> for delivery.`;
        }
        customNotice.style.display = "block";

        // Add active state to dropdown button if custom option is selected
        if (customDropdownButton) {
          customDropdownButton.classList.add("is--selected");
        }
      }
    });
  }, 100);

  // Initial thumbnail update on page load
  if (typeof $ !== "undefined") {
    setTimeout(() => {
      triggerThumbnailUpdate();
    }, 500);
  }

  // ---------- Storefront hydration ----------
  const productHandle = window.__PRODUCT_HANDLE__;
  if (!productHandle) {
    console.warn("[PFD] Missing window.__PRODUCT_HANDLE__");
    return;
  }

  const endpoint = `${window.location.origin}/api/2026-01/graphql.json`;

  function sfFetch(query, variables, fallback = false) {
    const headers = {
      "content-type": "application/json",
    };

    if (!fallback) {
      headers["X-Shopify-Storefront-Access-Token"] =
        "5b053b572b0031f80b6d0465d5be4a18";
    }

    return fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    }).then((r) => r.json());
  }

  async function hydrateAllVariants(fallback = false) {
    const variantImageField = fallback
      ? ""
      : `
      variant_image: metafield(key: "variant_image", namespace: "custom") {
        references(first: 5) {
          nodes {
            ... on MediaImage {
              id
              image {
                url
              }
            }
          }
        }
      }
    `;

    const quantityAvailableField = fallback ? "" : "quantityAvailable";

    const query = `
      query VariantsPage($handle: String!, $first: Int!, $after: String) {
        product(handle: $handle) {
          requiresSellingPlan
          variants(first: $first, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              title
              availableForSale
              selectedOptions { name value }
              sku
              taxable
              price {
                amount
              }
              compareAtPrice {
                amount
              }
              weight
              barcode
              ${quantityAvailableField}
              image {
                id
                url
                width
                height
                altText
              }
              ${variantImageField}
            }
          }
        }
      }
    `;

    let after = null;
    while (true) {
      const res = await sfFetch(
        query,
        {
          handle: productHandle,
          first: 250,
          after,
        },
        fallback,
      );

      if (res?.data?.product === null && !fallback) {
        return hydrateAllVariants(true);
      }

      const nodes = res?.data?.product?.variants?.nodes || [];
      const pageInfo = res?.data?.product?.variants?.pageInfo;
      const productRequiresSellingPlan =
        res?.data?.product?.requiresSellingPlan || false;

      for (const n of nodes) {
        const gid = String(n.id);
        const numericId = gid.includes("/") ? gid.split("/").pop() : gid;

        const optMap = new Map(
          (n.selectedOptions || []).map((o) => [
            normName(o.name),
            normVal(o.value),
          ]),
        );

        // Extract variant images - collect all images from variant_image metafield
        const variantImageNodes = n.variant_image?.references?.nodes || [];
        const variantImages = variantImageNodes
          .map((node) => node.image?.url)
          .filter(Boolean);
        const mainImageUrl = n.image?.url;
        const imageUrl = mainImageUrl;

        // Build featured_image object to match theme format
        const featuredImage = n.image
          ? {
              id: n.image.id
                ? String(n.image.id).includes("/")
                  ? String(n.image.id).split("/").pop()
                  : n.image.id
                : null,
              src: n.image.url,
              width: n.image.width || 600,
              height: n.image.height || 600,
              alt: n.image.altText || null,
            }
          : null;

        // Build featured_media object to match theme format
        const featuredMedia = n.image
          ? {
              id: n.image.id
                ? String(n.image.id).includes("/")
                  ? String(n.image.id).split("/").pop()
                  : n.image.id
                : null,
              alt: n.image.altText || null,
              preview_image: {
                aspect_ratio:
                  n.image.width && n.image.height
                    ? n.image.width / n.image.height
                    : 1,
                height: n.image.height || 600,
                width: n.image.width || 600,
                src: n.image.url,
              },
            }
          : null;

        // Get option values for title and public_title
        const optionValues = (n.selectedOptions || []).map((o) => o.value);

        const rawVariant = {
          id: numericId,
          title: n.title,
          available: !!n.availableForSale,
          sku: n.sku,
          requires_shipping: true,
          taxable: n.taxable !== false,
          featured_image: featuredImage,
          options: optionValues,
          price: n.price ? Math.round(parseFloat(n.price.amount) * 100) : 0,
          weight: n.weight || 0,
          compare_at_price: n.compareAtPrice
            ? Math.round(parseFloat(n.compareAtPrice.amount) * 100)
            : null,
          inventory_management: "shopify",
          barcode: n.barcode || "",
          featured_media: featuredMedia,
          inventory_policy: null,
          inventory_quantity:
            n.quantityAvailable !== undefined ? n.quantityAvailable : 0,
          imageUrl: imageUrl,
          variantImages:
            variantImages.length > 0
              ? variantImages
              : mainImageUrl
                ? [mainImageUrl]
                : [],
        };

        for (let i = 0; i < optionCount; i++) {
          const optName = normName(options?.[i]?.name);
          rawVariant[`option${i + 1}`] = optName
            ? optMap.get(optName) || ""
            : "";
        }

        const v = buildThemeVariant(rawVariant, productRequiresSellingPlan);

        // Store the product selling plan info for upsertVariant
        v._productRequiresSellingPlan = productRequiresSellingPlan;

        upsertVariant(v);

        // Ensure option exists in select for hydrated variants
        ensureSelectOption(numericId, v);
      }

      // Patch as data arrives (won't disable everything if partial)
      patchAllAvailability();

      if (!pageInfo?.hasNextPage) break;
      after = pageInfo.endCursor;
    }

    // Final pass once all data is in
    patchAllAvailability();

    // Update swatch images with the loaded data
    updateSwatchImages();

    // Update variant images sections with the loaded data
    updateVariantImages();

    // Update thumbnails after hydration completes
    if (typeof $ !== "undefined") {
      setTimeout(() => {
        triggerThumbnailUpdate();
      }, 200);
    }
  }

  function setDefaultVariant() {
    console.log("[PFD] Selected Variant", window.__HAS_SELECTED__);
    console.log("[PFD] Default Variant", window.__DEFAULT_VARIANT__);

    // If there is a selected variant, do nothing (handled by server)
    if (window.__HAS_SELECTED__) {
      console.log(
        "[PFD] Selected variant exists, skipping default variant logic",
      );
      return;
    }

    // If there is no selected variant, set the default variant
    const defaultVariant = window.__DEFAULT_VARIANT__;
    if (!defaultVariant || !defaultVariant.id) {
      console.log("[PFD] No default variant specified");
      return;
    }

    console.log("[PFD] Setting default variant:", defaultVariant.id);

    // Get the variant from our data
    const variant = variantById.get(String(defaultVariant.id));
    console.log("variant", { ...variant });
    if (!variant) {
      console.log("[PFD] Variant not found in cache:", defaultVariant.id);
      return;
    }

    // Step 1: Update selectedValues array (critical for system to work)
    for (let i = 0; i < optionCount; i++) {
      selectedValues[i] = variant[`option${i + 1}`] || "";
    }

    // Step 2: Clear all current visual selections
    document
      .querySelectorAll("[data-swatch-item].is--selected")
      .forEach((el) => {
        el.classList.remove("is--selected");
      });

    // Step 3: Update visual state for each option (exactly like click handler)
    for (let i = 0; i < optionCount; i++) {
      const optionValue = variant[`option${i + 1}`];
      if (!optionValue) continue;

      const optEl = document.querySelector(
        `[data-swatch-option][data-id="${i}"]`,
      );
      if (!optEl) continue;

      const swatchItem = optEl.querySelector(
        `[data-swatch-item][data-value="${optionValue.replace(/"/g, '\\"')}"]`,
      );
      console.log(swatchItem);

      // Check if this is a split option (has both standard and custom dropdown)
      const isSplitOption = optEl.classList.contains("pfd-split-option");

      if (swatchItem) {
        swatchItem.classList.add("is--selected");

        // Update display value exactly like click handler
        const optionUnit = optEl.getAttribute("data-option-unit") || "";
        const displayValue = getDisplayValue(optionValue, optionUnit);

        let titleElement = optEl.querySelector(
          ".t4s-swatch__title--right .bold",
        );
        if (titleElement) {
          titleElement.textContent = displayValue;
        } else {
          titleElement = optEl.querySelector(".t4s-selected-value");
          if (titleElement) {
            titleElement.textContent = displayValue;
          }
        }

        // Handle dropdown logic for split options
        if (isSplitOption) {
          const isFromCustomDropdown = swatchItem.closest(
            ".pfd-custom-options",
          );

          if (isFromCustomDropdown) {
            // Custom option selected - update dropdown button and show custom notice
            const customDropdown = optEl.querySelector(
              ".pfd-custom-dropdown [data-current-value]",
            );
            const customDropdownButton = optEl.querySelector(
              ".pfd-custom-dropdown",
            );

            if (customDropdown) {
              customDropdown.innerHTML = `${displayValue} <span class="pfd-custom-badge">Custom</span>`;
            }

            if (customDropdownButton) {
              customDropdownButton.classList.add("is--selected");
            }

            // Show custom notice
            const customNotice = optEl.querySelector(".pfd-custom-notice");
            if (customNotice) {
              const optionName =
                optEl.getAttribute("data-option-name") || "item";
              const noticeText = customNotice.querySelector(
                ".pfd-custom-notice-text",
              );
              if (noticeText) {
                noticeText.innerHTML = `Custom ${optionName.toLowerCase()}s are <strong>made to order</strong>. Please allow <span class="pfd-custom-notice-highlight">6-8 weeks</span> for delivery.`;
              }
              customNotice.style.display = "block";
            }
          } else {
            // Standard option selected - reset dropdown to default state
            const customDropdown = optEl.querySelector(
              ".pfd-custom-dropdown [data-current-value]",
            );
            const customDropdownButton = optEl.querySelector(
              ".pfd-custom-dropdown",
            );

            if (customDropdown) {
              const optionName = optEl.getAttribute("data-option-name") || "";
              customDropdown.textContent = `Custom ${optionName.toLowerCase()}`;
            }

            if (customDropdownButton) {
              customDropdownButton.classList.remove("is--selected");
            }

            // Hide custom notice
            const customNotice = optEl.querySelector(".pfd-custom-notice");
            if (customNotice) {
              customNotice.style.display = "none";
            }
          }
        }
      } else if (isSplitOption) {
        // No matching swatch item found, but this is a split option
        // Reset dropdown to default state since selection is not in standard or custom options
        const customDropdown = optEl.querySelector(
          ".pfd-custom-dropdown [data-current-value]",
        );
        const customDropdownButton = optEl.querySelector(
          ".pfd-custom-dropdown",
        );

        if (customDropdown) {
          const optionName = optEl.getAttribute("data-option-name") || "";
          customDropdown.textContent = `Custom ${optionName.toLowerCase()}`;
        }

        if (customDropdownButton) {
          customDropdownButton.classList.remove("is--selected");
        }

        // Hide custom notice
        const customNotice = optEl.querySelector(".pfd-custom-notice");
        if (customNotice) {
          customNotice.style.display = "none";
        }
      }
    }

    // Step 4: Update HTML data attributes on select option (like click handler does)
    const selectedOption = selectEl?.querySelector(
      `option[value="${defaultVariant.id}"]`,
    );
    if (selectedOption) {
      selectedOption.setAttribute("data-incoming", variant.incoming || "false");
      selectedOption.setAttribute(
        "data-nextincomingdate",
        variant.nextIncomingDate || "",
      );
      selectedOption.setAttribute(
        "data-inventorypolicy",
        variant.inventoryPolicy || "deny",
      );
      selectedOption.setAttribute(
        "data-inventoryquantity",
        variant.inventoryQuantity || (variant.available ? "999" : "0"),
      );
    }

    // Step 5: Ensure DOM exists for variant
    ensureDOMForVariant(defaultVariant.id);

    // Step 6: Apply to select element
    applyVariantToSelect(defaultVariant.id);

    // Step 7: Re-patch availability (exactly like click handler)
    patchAllAvailability();

    // Update thumbnails after hydration completes
    if (typeof $ !== "undefined") {
      setTimeout(() => {
        triggerThumbnailUpdate();
      }, 200);
    }
  }

  hydrateAllVariants(false)
    .then(() => {
      setDefaultVariant();
    })
    .catch((e) => console.warn("[PFD] Hydration failed", e));
})();
