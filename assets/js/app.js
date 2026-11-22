(() => {
  const cfg = window.XAEROS_CONFIG || {};
  const map = L.map('map').setView([48.8, 31.2], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const drawn = new L.FeatureGroup().addTo(map);
  const alertsLayer = L.layerGroup().addTo(map);
  const savedZones = JSON.parse(localStorage.getItem('xaeros-zones') || '[]');
  let alerts = [];
  let previous = new Set();

  map.addControl(new L.Control.Draw({
    draw: { polyline:false, rectangle:true, polygon:true, circle:true, marker:false, circlemarker:false },
    edit: { featureGroup: drawn }
  }));

  function persistZones() {
    const zones = [];
    drawn.eachLayer(layer => zones.push(layer.toGeoJSON()));
    localStorage.setItem('xaeros-zones', JSON.stringify(zones));
    renderZones();
  }
  savedZones.forEach(feature => {
    try { L.geoJSON(feature, {style:{color:'#63a7ff',weight:2,fillOpacity:.12}}).eachLayer(layer => drawn.addLayer(layer)); } catch(e) {}
  });
  map.on(L.Draw.Event.CREATED, e => { e.layer.setStyle?.({color:'#63a7ff',weight:2,fillOpacity:.12}); drawn.addLayer(e.layer); persistZones(); });
  map.on(L.Draw.Event.EDITED, persistZones);
  map.on(L.Draw.Event.DELETED, persistZones);

  function renderZones() {
    const el = document.getElementById('zoneList');
    const layers = []; drawn.eachLayer(l => layers.push(l));
    if (!layers.length) { el.innerHTML = '<p class="empty">Пока нет зон. Нарисуйте зону на карте.</p>'; return; }
    el.innerHTML = layers.map((_,i) => `<div class="zone-row"><span>Зона ${i+1}</span><span>Сохранена</span></div>`).join('');
  }

  function renderAlerts() {
    alertsLayer.clearLayers();
    const active = alerts.filter(a => a.active);
    document.getElementById('activeCount').textContent = active.length;
    document.getElementById('updatedAt').textContent = 'Обновлено: ' + new Date().toLocaleTimeString('ru-RU');
    document.getElementById('sourceMessage').textContent = alerts.length
      ? 'Данные получены из настроенного источника. Проверяйте актуальность у официальных служб.'
      : 'Источник вернул пустой список или данные ещё не поступили.';
    active.forEach(a => {
      if (Array.isArray(a.coordinates) && a.coordinates.length === 2) {
        L.circleMarker(a.coordinates, {radius:9,color:'#ff5364',fillColor:'#ff5364',fillOpacity:.8})
          .bindPopup(`<b>${escapeHtml(a.region || 'Регион')}</b><br>Активная тревога по источнику`).addTo(alertsLayer);
      }
    });
    const list = document.getElementById('eventList');
    list.innerHTML = alerts.length ? alerts.slice(0,12).map(a =>
      `<div class="event-row"><span>${escapeHtml(a.region || 'Регион')}</span><b style="color:${a.active?'#ff6474':'#38c98b'}">${a.active?'ТРЕВОГА':'ОТБОЙ'}</b></div>`
    ).join('') : '<p class="empty">Нет событий для отображения.</p>';
    const now = new Set(active.map(a => a.region));
    if ('Notification' in window && Notification.permission === 'granted') {
      now.forEach(region => { if (!previous.has(region)) new Notification('Xaeros Radar — тревога', {body:`Активная воздушная тревога: ${region}`}); });
    }
    previous = now;
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  async function refresh() {
    const url = cfg.alertsApiUrl;
    if (!url) {
      document.getElementById('connection').textContent = 'Демо-режим · API не подключён';
      document.getElementById('sourceMessage').textContent = 'Живые данные не подключены. Настройте alertsApiUrl в config.js; не используйте эту страницу как источник информации об опасности.';
      document.getElementById('activeCount').textContent = '—';
      return;
    }
    try {
      const response = await fetch(url, {cache:'no-store'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Ожидался массив событий');
      alerts = data;
      document.getElementById('connection').textContent = 'Источник подключён';
      renderAlerts();
    } catch (err) {
      document.getElementById('connection').textContent = 'Ошибка источника';
      document.getElementById('sourceMessage').textContent = `Не удалось получить данные: ${err.message}. Проверьте URL, формат ответа и CORS.`;
    }
  }

  document.getElementById('refreshBtn').addEventListener('click', refresh);
  document.getElementById('notifyBtn').addEventListener('click', async () => {
    if (!('Notification' in window)) return alert('Этот браузер не поддерживает уведомления.');
    const permission = await Notification.requestPermission();
    alert(permission === 'granted' ? 'Уведомления разрешены.' : 'Разрешение не предоставлено.');
  });
  document.getElementById('locateBtn').addEventListener('click', () => {
    if (!navigator.geolocation) return alert('Геолокация не поддерживается.');
    navigator.geolocation.getCurrentPosition(
      p => map.setView([p.coords.latitude,p.coords.longitude], 12),
      () => alert('Не удалось получить местоположение. Проверьте разрешение браузера.')
    );
  });

  renderZones();
  refresh();
  if (cfg.alertsApiUrl) setInterval(refresh, Math.max(15000, cfg.refreshIntervalMs || 60000));
})();
