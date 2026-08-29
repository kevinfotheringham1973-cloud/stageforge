(function () {
  var lightbox = document.getElementById("lightbox");
  var lightboxImg = document.getElementById("lightbox-img");
  document.querySelectorAll(".browser-frame img").forEach(function (img) {
    img.addEventListener("click", function () {
      lightboxImg.src = img.src;
      lightboxImg.alt = img.alt;
      lightbox.classList.add("open");
    });
  });
  lightbox.addEventListener("click", function () {
    lightbox.classList.remove("open");
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") lightbox.classList.remove("open");
  });
})();
