(() => {
  const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
  const MAX_BYTES = 15 * 1024 * 1024;
  const QUALITY = 0.95;

  const $ = (id) => document.getElementById(id);
  const drop = $("drop"), input = $("input"), work = $("work");
  const img = $("img"), scan = $("scan"), badge = $("badge");
  const fname = $("fname"), fsize = $("fsize"), chips = $("chips");
  const success = $("success"), errorEl = $("error");
  const cleanBtn = $("cleanBtn"), dlBtn = $("dlBtn"), resetBtn = $("resetBtn");

  let fileType = "", file = null, previewUrl = null, resultUrl = null;

  const EXT_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  const typeOf = (f) => ACCEPTED.includes(f.type) ? f.type : (EXT_TYPES[(f.name.split(".").pop() || "").toLowerCase()] || "");

  const formatSize = (b) =>
    b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`;

  const showError = (msg) => { errorEl.textContent = msg; errorEl.hidden = !msg; };

  // Looks for known metadata markers inside the raw file bytes.
  async function scanMetadata(blob) {
    const text = new TextDecoder("latin1").decode(await blob.arrayBuffer());
    const found = [];
    if (/Exif\0\0|eXIf/.test(text)) found.push("EXIF");
    if (/ns\.adobe\.com\/xap|<x:xmpmeta|XML:com\.adobe\.xmp/.test(text)) found.push("XMP");
    if (/Photoshop 3\.0|8BIM/.test(text)) found.push("IPTC");
    if (/c2pa|jumbf|jumd|contentauth/i.test(text)) found.push("Content Credentials (C2PA)");
    if (/iTXt|tEXt|zTXt/.test(text) && blob.type === "image/png") found.push("PNG text chunks");
    return found;
  }

  function renderChips(list, ok) {
    chips.innerHTML = "";
    if (!list.length) {
      const c = document.createElement("span");
      c.className = "chip neutral";
      c.textContent = ok ? "No metadata found" : "No known metadata detected";
      chips.appendChild(c);
      return;
    }
    list.forEach((t) => {
      const c = document.createElement("span");
      c.className = "chip" + (ok ? " ok" : "");
      c.textContent = ok ? `${t} removed` : `${t} found`;
      chips.appendChild(c);
    });
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    file = previewUrl = resultUrl = null;
    input.value = "";
    work.hidden = true;
    drop.hidden = false;
    scan.hidden = badge.hidden = success.hidden = dlBtn.hidden = true;
    cleanBtn.hidden = false;
    cleanBtn.disabled = false;
    cleanBtn.textContent = "Remove metadata";
    resetBtn.textContent = "Choose a different photo";
    resetBtn.disabled = false;
    showError("");
  }

  async function handleFile(f) {
    if (!f) return;
    const type = typeOf(f);
    if (!type) return showError("Use a JPG, PNG, or WebP image. (HEIC/AVIF are not supported.)");
    if (f.size > MAX_BYTES) return showError("This file is over 15 MB. Choose a smaller image.");
    reset();
    file = f;
    fileType = type;
    previewUrl = URL.createObjectURL(f);
    img.src = previewUrl;
    fname.textContent = f.name;
    fsize.textContent = formatSize(f.size);
    drop.hidden = true;
    work.hidden = false;
    renderChips(await scanMetadata(f), false);
  }

  // Re-drawing pixels onto a canvas and exporting a fresh file
  // drops every metadata block (EXIF, XMP, IPTC, C2PA, text chunks).
  async function clean() {
    showError("");
    cleanBtn.disabled = resetBtn.disabled = true;
    cleanBtn.textContent = "Cleaning…";
    scan.hidden = false;
    try {
      let bitmap;
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch {
        bitmap = await new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = () => rej(new Error("decode"));
          im.src = previewUrl;
        });
      }
      const w = bitmap.width || bitmap.naturalWidth, h = bitmap.height || bitmap.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (fileType === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close?.();

      const blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("Export failed"))), fileType, QUALITY)
      );
      // Small pause so the scan animation is visible
      await new Promise((r) => setTimeout(r, 700));

      const before = await scanMetadata(file);
      resultUrl = URL.createObjectURL(blob);
      img.src = resultUrl;
      fsize.textContent = `${formatSize(file.size)} → ${formatSize(blob.size)}`;
      renderChips(before, true);

      const ext = fileType.split("/")[1].replace("jpeg", "jpg");
      dlBtn.href = resultUrl;
      dlBtn.download = `clean-${file.name.replace(/\.[^.]+$/, "")}.${ext}`;

      cleanBtn.hidden = true;
      dlBtn.hidden = false;
      badge.hidden = success.hidden = false;
      resetBtn.textContent = "Clean another photo";
    } catch (e) {
      showError("This image couldn't be processed. Try a different file.");
      cleanBtn.textContent = "Remove metadata";
      cleanBtn.disabled = false;
    } finally {
      scan.hidden = true;
      resetBtn.disabled = false;
    }
  }

  input.addEventListener("change", (e) => handleFile(e.target.files?.[0]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-dragging"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-dragging"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("is-dragging");
    handleFile(e.dataTransfer.files?.[0]);
  });
  ["dragover", "drop"].forEach((ev) =>
    window.addEventListener(ev, (e) => {
      e.preventDefault();
      if (ev === "drop" && !drop.contains(e.target)) handleFile(e.dataTransfer?.files?.[0]);
    })
  );
  cleanBtn.addEventListener("click", clean);
  resetBtn.addEventListener("click", reset);
})();