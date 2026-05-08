import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const STORAGE_KEY = 'lost-helper-saved-places';
const ORIENTATION_KEY = 'lost-helper-facing';

function toRad(value) {
  return (value * Math.PI) / 180;
}

function toDeg(value) {
  return (value * 180) / Math.PI;
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function shortestAngle(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function formatCoordinate(value) {
  if (typeof value !== 'number') return '等待中...';
  return value.toFixed(5);
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters)} 公尺`;
  return `${(meters / 1000).toFixed(1)} 公里`;
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function calculateDistance(a, b) {
  const radius = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function calculateBearing(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return normalizeDegrees(toDeg(Math.atan2(y, x)));
}

function directionText(offset) {
  const abs = Math.abs(offset);
  if (abs <= 30) return '直走';
  return offset < 0 ? '往左轉' : '往右轉';
}

function loadSavedPlaces() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function makeOsmMapUrl(position, zoom = 0.004) {
  if (!position) return '';
  const vertical = zoom * 0.75;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${position.lng - zoom}%2C${position.lat - vertical}%2C${position.lng + zoom}%2C${position.lat + vertical}&layer=mapnik&marker=${position.lat}%2C${position.lng}`;
}

function makeGoogleMapsUrl(position, label = '') {
  if (!position) return 'https://www.google.com/maps';
  const query = encodeURIComponent(label || `${position.lat},${position.lng}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function makeGoogleDirectionsUrl(destination) {
  if (!destination) return 'https://www.google.com/maps';
  return `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}&travelmode=walking`;
}

function shortAddress(value) {
  if (!value) return '';
  return value.split(',').slice(0, 3).join('').trim();
}

function getLocationLabel(address = {}) {
  return [
    address.city,
    address.town,
    address.village,
    address.county,
    address.state,
    address.country,
  ].find(Boolean) || '';
}

function speakText(text) {
  if (!text || !('speechSynthesis' in window)) return false;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-TW';
  utterance.rate = 0.88;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
  return true;
}

function App() {
  const [currentPosition, setCurrentPosition] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [locationStatus, setLocationStatus] = useState('正在尋找你的位置...');
  const [locationUpdatedAt, setLocationUpdatedAt] = useState(null);
  const [savedPlaces, setSavedPlaces] = useState(loadSavedPlaces);
  const [note, setNote] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [mode, setMode] = useState('home');
  const [destination, setDestination] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState('');
  const [searchRegion, setSearchRegion] = useState(null);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [facing, setFacing] = useState(() => {
    const stored = Number(localStorage.getItem(ORIENTATION_KEY));
    return Number.isFinite(stored) ? stored : null;
  });
  const [deviceHeading, setDeviceHeading] = useState(null);
  const [orientationStatus, setOrientationStatus] = useState('');

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('這台裝置無法取得位置。');
      return;
    }

    const watcher = navigator.geolocation.watchPosition(
      handlePosition,
      () => {
        setLocationStatus('請允許位置權限。');
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 },
    );

    return () => navigator.geolocation.clearWatch(watcher);
  }, []);

  useEffect(() => {
    if (!currentPosition) return;

    const controller = new AbortController();
    const roundedLat = currentPosition.lat.toFixed(5);
    const roundedLng = currentPosition.lng.toFixed(5);

    fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${roundedLat}&lon=${roundedLng}`,
      { signal: controller.signal },
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.display_name) setLocationName(data.display_name);
        if (data?.address) {
          setSearchRegion({
            label: getLocationLabel(data.address),
            countryCode: data.address.country_code || '',
          });
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, [currentPosition?.lat, currentPosition?.lng]);

  useEffect(() => {
    const handleOrientation = (event) => {
      const webkitHeading = event.webkitCompassHeading;
      const alpha = typeof event.alpha === 'number' ? 360 - event.alpha : null;
      const heading =
        typeof webkitHeading === 'number' ? webkitHeading : alpha;
      if (typeof heading === 'number') setDeviceHeading(normalizeDegrees(heading));
    };

    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => window.removeEventListener('deviceorientation', handleOrientation, true);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPlaces));
  }, [savedPlaces]);

  const direction = useMemo(() => {
    if (!currentPosition || !destination) return null;
    const bearing = calculateBearing(currentPosition, destination);
    const distance = calculateDistance(currentPosition, destination);
    const reference = facing ?? 0;
    const offset = shortestAngle(reference, bearing);
    return {
      bearing,
      distance,
      text: directionText(offset),
      isCalibrated: facing !== null,
    };
  }, [currentPosition, destination, facing]);

  const displayLocation = shortAddress(locationName) || '正在確認目前位置';
  const destinationName = destination?.note || destination?.address || '目的地';

  function showVoiceStatus(message) {
    setVoiceStatus(message);
    window.setTimeout(() => setVoiceStatus(''), 2200);
  }

  function speakOrWarn(text) {
    if (speakText(text)) {
      showVoiceStatus('正在語音提示。');
    } else {
      showVoiceStatus('這個瀏覽器目前不支援語音。');
    }
  }

  function getDirectionSpeech(place = destination, currentDirection = direction) {
    if (!place || !currentDirection) return '正在判斷方向，請稍等一下。';
    const name = place.note || place.address || '目的地';
    return `目的地是${name}。請先${currentDirection.text}。距離大約${formatDistance(currentDirection.distance)}。`;
  }

  function speakCurrentAddress() {
    if (!currentPosition) {
      speakOrWarn('還沒有取得目前位置，請先允許定位。');
      return;
    }
    speakOrWarn(`你現在在這裡。${displayLocation}。經緯度是${formatCoordinate(currentPosition.lat)}，${formatCoordinate(currentPosition.lng)}。`);
  }

  function startDirectionTo(place, shouldSpeak = false) {
    setDestination(place);
    setMode('direction');

    if (shouldSpeak && currentPosition) {
      const nextDirection = {
        distance: calculateDistance(currentPosition, place),
        text: directionText(shortestAngle(facing ?? 0, calculateBearing(currentPosition, place))),
      };
      speakOrWarn(getDirectionSpeech(place, nextDirection));
    } else if (shouldSpeak) {
      speakOrWarn('還沒有取得目前位置，請先允許定位。');
    }
  }

  function speakDirectionNow() {
    speakOrWarn(getDirectionSpeech(destination, direction));
  }

  function handlePosition(position) {
    setCurrentPosition({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
    });
    setLocationUpdatedAt(Date.now());
    setLocationStatus('已取得目前位置');
  }

  function refreshLocation() {
    if (!navigator.geolocation) {
      setLocationStatus('這台裝置無法取得位置。');
      return;
    }

    setLocationStatus('正在重新定位...');
    navigator.geolocation.getCurrentPosition(
      handlePosition,
      () => setLocationStatus('請允許位置權限。'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
    );
  }

  function saveCurrentPlace() {
    if (!currentPosition) return;
    const place = {
      id: crypto.randomUUID(),
      lat: currentPosition.lat,
      lng: currentPosition.lng,
      note: note.trim(),
      address: displayLocation,
      timestamp: Date.now(),
    };
    setSavedPlaces((places) => [place, ...places]);
    setNote('');
    setSaveStatus('已記錄這個位置。');
    window.setTimeout(() => setSaveStatus(''), 2200);
  }

  async function searchDestination() {
    const query = searchQuery.trim();
    if (!query) return;

    setSearchStatus('正在搜尋地點...');
    setSearchResults([]);

    const params = new URLSearchParams({
      format: 'jsonv2',
      q: searchRegion?.label ? `${query} ${searchRegion.label}` : query,
      limit: '8',
      addressdetails: '1',
    });

    if (currentPosition) {
      const lngRange = 0.45;
      const latRange = 0.32;
      params.set(
        'viewbox',
        [
          currentPosition.lng - lngRange,
          currentPosition.lat + latRange,
          currentPosition.lng + lngRange,
          currentPosition.lat - latRange,
        ].join(','),
      );
      params.set('bounded', '1');
    }

    if (searchRegion?.countryCode) {
      params.set('countrycodes', searchRegion.countryCode);
    }

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
      const data = response.ok ? await response.json() : [];
      const results = Array.isArray(data)
        ? data.map((item) => ({
            id: item.place_id,
            lat: Number(item.lat),
            lng: Number(item.lon),
            note: item.name || shortAddress(item.display_name) || query,
            address: item.display_name,
            timestamp: Date.now(),
            source: 'openstreetmap',
            distanceFromHere: currentPosition
              ? calculateDistance(currentPosition, { lat: Number(item.lat), lng: Number(item.lon) })
              : null,
          })).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
            .sort((a, b) => (a.distanceFromHere ?? Infinity) - (b.distanceFromHere ?? Infinity))
        : [];
      setSearchResults(results);
      setSearchStatus(results.length ? '選一個地點作為目的地。' : '找不到地點，試試更完整的地址或店名。');
    } catch {
      setSearchStatus('目前無法搜尋地點。');
    }
  }

  async function calibrateFacing() {
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result !== 'granted') {
          setOrientationStatus('無法使用手機方向感測。');
          return;
        }
      } catch {
        setOrientationStatus('無法使用手機方向感測。');
        return;
      }
    }

    if (typeof deviceHeading === 'number') {
      setFacing(deviceHeading);
      localStorage.setItem(ORIENTATION_KEY, String(deviceHeading));
      setOrientationStatus('已記住你現在面向的方向。');
    } else {
      setFacing(0);
      localStorage.setItem(ORIENTATION_KEY, '0');
      setOrientationStatus('目前使用大略方向。');
    }
  }

  function deletePlace(placeId) {
    setSavedPlaces((places) => places.filter((place) => place.id !== placeId));
  }

  async function sharePlace(place) {
    const title = place.note || place.address || '我的位置';
    const text = `${title}\n${formatCoordinate(place.lat)}, ${formatCoordinate(place.lng)}`;
    const url = `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=18/${place.lat}/${place.lng}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        return;
      }
    } else {
      await navigator.clipboard?.writeText(`${text}\n${url}`);
      setSaveStatus('地點連結已複製。');
    }
  }

  function openGoogleMaps(place) {
    window.open(makeGoogleMapsUrl(place, place.note || place.address), '_blank', 'noopener,noreferrer');
  }

  function openGoogleDirections(place) {
    window.open(makeGoogleDirectionsUrl(place), '_blank', 'noopener,noreferrer');
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="kicker">Lost Helper</p>
          <h1>我在哪裡</h1>
        </div>
        <div className="header-meta">
          <span>Developer: Cutefish</span>
          <strong>{savedPlaces.length} 筆</strong>
        </div>
      </header>

      <section className="quick-actions" aria-label="主要功能">
        <button className="action-card action-card-save" onClick={saveCurrentPlace} disabled={!currentPosition}>
          <span className="action-icon">▣</span>
          <strong>記下這裡</strong>
          <small>儲存目前位置</small>
        </button>
        <button className="action-card action-card-find" onClick={() => setMode('choose')}>
          <span className="action-icon">⌖</span>
          <strong>找方向</strong>
          <small>選目的地</small>
        </button>
      </section>

      <section className="hero-section">
        <div className="current-card">
          <div className="pin-icon">⌖</div>
          <div className="current-copy">
            <p className="status">你現在在這裡</p>
            <h2>{displayLocation}</h2>
            <p className="place-name">
              經緯度 {formatCoordinate(currentPosition?.lat)}, {formatCoordinate(currentPosition?.lng)}
            </p>
            <p className="accuracy-line">
              {currentPosition?.accuracy ? `誤差約 ${Math.round(currentPosition.accuracy)} 公尺` : locationStatus}
              {currentPosition?.accuracy && currentPosition.accuracy <= 30 ? <span>精準</span> : null}
            </p>
            {locationUpdatedAt && <p className="updated-line">更新於 {formatTime(locationUpdatedAt)}</p>}
          </div>
          <div className="current-actions">
            <button className="refresh-button" onClick={refreshLocation}>重新定位</button>
            <button className="voice-button" onClick={speakCurrentAddress}>唸出地址</button>
          </div>
          {voiceStatus && mode !== 'direction' && <p className="voice-status current-voice-status">{voiceStatus}</p>}
        </div>

        <div className="map-frame" aria-label="Map around your current place">
          {currentPosition ? (
            <>
              <MapPreview position={currentPosition} title="目前位置地圖" />
              <div className="map-address">{displayLocation}</div>
            </>
          ) : (
            <div className="map-placeholder">允許定位後會顯示地圖</div>
          )}
        </div>
      </section>

      <section className="action-section">
        <label className="note-field">
          <span>這裡是什麼地方？</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="停車位置、出口、路口..."
          />
        </label>

        <button className="primary-button save" onClick={saveCurrentPlace} disabled={!currentPosition}>
          一鍵記錄這個位置
        </button>
        {saveStatus && <p className="save-status">{saveStatus}</p>}
      </section>

      {mode === 'choose' && (
        <section className="section-block">
          <div className="section-heading">
            <h2>選擇目的地</h2>
            <button className="text-button" onClick={() => setMode('home')}>關閉</button>
          </div>

          <div className="search-destination">
            <label className="note-field">
              <span>用地址或店名搜尋</span>
              <p className="region-hint">
                {searchRegion?.label
                  ? `優先搜尋 ${searchRegion.label} 附近`
                  : '定位後會優先搜尋你所在城市附近'}
              </p>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') searchDestination();
                }}
                placeholder="例如：台北車站、附近餐廳、某某飯店"
              />
            </label>
            <div className="search-actions">
              <button onClick={searchDestination}>搜尋目的地</button>
              <a
                href={`https://www.google.com/maps/search/${encodeURIComponent(searchQuery || '餐廳')}`}
                target="_blank"
                rel="noreferrer"
              >
                開 Google Maps 查找
              </a>
            </div>
            <p className="google-note">
              Google Maps app 不能自動把選到的地點回傳到這裡；找到名稱後，回來用上方搜尋即可設為目的地。
            </p>
            {searchStatus && <p className="helper-text">{searchStatus}</p>}
            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => {
                      startDirectionTo(result, true);
                    }}
                  >
                    <strong>{result.note}</strong>
                    <span>{shortAddress(result.address)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <PlaceList
            places={savedPlaces}
            emptyText="儲存過的地點會出現在這裡。"
            onUse={(place) => startDirectionTo(place, true)}
            onDelete={deletePlace}
            onShare={sharePlace}
            onOpenMaps={openGoogleDirections}
          />
        </section>
      )}

      {mode === 'direction' && (
        <section className="direction-card">
          <p className="direction-label">先往這邊走</p>
          <h2>{direction?.text || '正在判斷方向...'}</h2>
          <p className="distance-text">
            {direction ? `目的地大約還有 ${formatDistance(direction.distance)}` : '請先選擇目的地。'}
          </p>
          {destination && <p className="destination-name">目的地：{destinationName}</p>}
          <div className="voice-actions">
            <button className="voice-primary" onClick={speakDirectionNow}>語音報方向</button>
            <button className="voice-secondary" onClick={() => speakOrWarn(`目的地是${destinationName}。${destination?.address || destinationName}`)}>
              語音報地址
            </button>
          </div>
          {voiceStatus && <p className="voice-status">{voiceStatus}</p>}
          <button className="calibrate-button" onClick={calibrateFacing}>
            我現在面向前方
          </button>
          <p className="helper-text">
            {orientationStatus || (direction?.isCalibrated ? '正在使用你記住的前方。' : '目前使用大略方向。')}
          </p>
          <button className="secondary-button" onClick={() => setMode('choose')}>
            更換目的地
          </button>
          {destination && (
            <button className="secondary-button maps-button" onClick={() => openGoogleDirections(destination)}>
              一鍵開 Google Maps 導航
            </button>
          )}
        </section>
      )}

      <section className="section-block">
        <div className="section-heading">
          <h2>儲存的地點</h2>
          <span>{savedPlaces.length}</span>
        </div>
        <PlaceList
          places={savedPlaces}
          emptyText="想記住某個位置時，點一下「儲存這個地點」。"
          onUse={(place) => startDirectionTo(place, true)}
          onDelete={deletePlace}
          onShare={sharePlace}
          onOpenMaps={openGoogleDirections}
        />
      </section>
    </main>
  );
}

function PlaceList({ places, emptyText, onUse, onDelete, onShare, onOpenMaps }) {
  if (!places.length) return <p className="empty-state">{emptyText}</p>;

  return (
    <div className="place-list">
      {places.map((place) => (
        <article className="place-card" key={place.id}>
          <div className="place-map">
            <MapPreview position={place} title={`${place.note || '地點'} 地圖`} compact />
          </div>
          <div className="place-body">
            <div>
              <h3>{place.note || place.address || '未命名地點'}</h3>
              <p>{formatTime(place.timestamp)}</p>
              <small>
                {formatCoordinate(place.lat)}, {formatCoordinate(place.lng)}
              </small>
            </div>
            <div className="place-actions">
              <button className="route-button" onClick={() => onUse(place)}>一鍵導航回去</button>
              <button className="light-button" onClick={() => onOpenMaps(place)}>Google Maps</button>
              <button className="light-button" onClick={() => onShare(place)}>分享</button>
              <button className="danger-button" onClick={() => onDelete(place.id)}>刪除</button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function MapPreview({ position, title, compact = false }) {
  if (!position) return null;

  return <iframe title={title} src={makeOsmMapUrl(position, compact ? 0.003 : 0.004)} loading="lazy" />;
}

createRoot(document.getElementById('root')).render(<App />);
