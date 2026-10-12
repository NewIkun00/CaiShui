(function () {
  var config = window.LEDGERLY_SITE_CONFIG || {};
  var platformUrl = config.platformUrl || 'http://127.0.0.1:3020/login';
  document.querySelectorAll('.platform-link').forEach(function (link) {
    link.setAttribute('href', platformUrl);
  });

  if (!('IntersectionObserver' in window)) return;
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal, .section-head, .steps article, .feature-grid article, .risk-stack article').forEach(function (el) {
    observer.observe(el);
  });
})();
