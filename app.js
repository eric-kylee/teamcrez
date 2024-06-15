let map = L.map('map').setView([37.5665, 126.9780], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let routes = [];
let selectedRoutes = [];
let currentRoute = null;
let currentRoutePoints = [];
let routeCreationMode = false;
let gpxRouteCreationMode = false;

const osrmUrl = 'http://router.project-osrm.org/route/v1/driving/';
const startIcon = L.icon({
    iconUrl: 'assets/images/icons8-go-64.png',//'https://leafletjs.com/examples/custom-icons/leaf-green.png',
    shadowUrl: null,//'https://leafletjs.com/examples/custom-icons/leaf-shadow.png',
    iconSize: [8, 8],//[38, 95],
    shadowSize: null,//[50, 64],
    iconAnchor: [4, 4],//[22, 94],
    shadowAnchor: null,//[4, 62],
    popupAnchor: [0, -2]
});
const endIcon = L.icon({
    iconUrl: 'assets/images/icons8-finish-50.png',//'https://leafletjs.com/examples/custom-icons/leaf-red.png',
    shadowUrl: null,//'https://leafletjs.com/examples/custom-icons/leaf-shadow.png',
    iconSize: [25, 25],//[38, 95],
    shadowSize: null,//[50, 64],
    iconAnchor: [2, 24],//[22, 94],
    shadowAnchor: null,//[4, 62],
    popupAnchor: [0, 0],//[-3, -76]
});

map.on('click', onMapClick);

document.getElementById('start-route-creation').addEventListener('click', startRouteCreation);
document.getElementById('start-gpx-route-creation').addEventListener('click', startGpxRouteCreation);
document.getElementById('register-route').addEventListener('click', registerRoute);
document.getElementById('register-gpx-route').addEventListener('click', registerGpxRoute);
document.getElementById('cancel-route-creation').addEventListener('click', cancelRouteCreation);
document.getElementById('cancel-gpx-route-creation').addEventListener('click', cancelGpxRouteCreation);
document.getElementById('play-videos').addEventListener('click', playSelectedVideos);
document.getElementById('export-routes').addEventListener('click', exportRoutes);
document.getElementById('menu-button').addEventListener('click', function() {
    const controls = document.getElementById('controls');
    if (controls.style.display === 'block') {
        controls.style.display = 'none';
    } else {
        controls.style.display = 'block';
    }
});

window.onload = function() {
    updatePlayButtonState();
    const queryParams = new URLSearchParams(window.location.search);
    const prerouteFile = queryParams.get('pr');
    if (prerouteFile) {
        loadInitialRoutes(prerouteFile);
    }
    document.getElementById('controls').style.display = 'none';  // Ensure controls are hidden on load
    document.getElementById('route-list').style.height = document.getElementById('map').clientHeight + 'px'; // Adjust route-list height
    updateRouteListMessage(); // Update the message visibility based on initial routes

    // Set the overflow-x style to hidden to prevent horizontal scrolling
    document.body.style.overflowX = 'hidden';
    document.getElementById('route-list').style.overflowX = 'hidden';
};

function startRouteCreation() {
    routeCreationMode = true;
    document.getElementById('start-route-creation').style.display = 'none';
    document.getElementById('start-gpx-route-creation').style.display = 'none';
    document.getElementById('register-route').style.display = '';
    document.getElementById('cancel-route-creation').style.display = '';
    document.getElementById('play-videos').style.display = 'none';
    document.getElementById('route-list').style.display = 'none';
    hideExistingRoutes();
    document.getElementById('controls').style.display = 'none';
}

function startGpxRouteCreation() {
    let input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gpx';
    input.onchange = e => {
        let file = e.target.files[0];
        let reader = new FileReader();
        reader.onload = function(event) {
            let gpxData = event.target.result;
            parseGpxFile(gpxData);
        };
        reader.readAsText(file);
    };
    input.click();
    document.getElementById('controls').style.display = 'none';
}

function parseGpxFile(gpxData) {
    let parser = new DOMParser();
    let xmlDoc = parser.parseFromString(gpxData, 'application/xml');
    let trkpts = xmlDoc.getElementsByTagName('trkpt');
    let latLngs = [];
    for (let i = 0; i < trkpts.length; i++) {
        let lat = parseFloat(trkpts[i].getAttribute('lat'));
        let lon = parseFloat(trkpts[i].getAttribute('lon'));
        latLngs.push([lat, lon]);
    }
    currentRoute = L.polyline(latLngs, { color: 'red' }).addTo(map);
    gpxRouteCreationMode = true;
    document.getElementById('start-route-creation').style.display = 'none';
    document.getElementById('start-gpx-route-creation').style.display = 'none';
    document.getElementById('register-gpx-route').style.display = '';
    document.getElementById('cancel-gpx-route-creation').style.display = '';
    document.getElementById('play-videos').style.display = 'none';
    document.getElementById('route-list').style.display = 'none';
    hideExistingRoutes();
}

async function fetchYoutubeMetadata(url) {
    const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
    try {
        const response = await fetch(proxyUrl + url);
        if (!response.ok) {
            console.error(`Error fetching YouTube metadata: ${response.statusText}`);
            return { title: '', thumbnail: '' };
        }
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const title = doc.querySelector('meta[property="og:title"]').getAttribute('content');
        const thumbnail = doc.querySelector('meta[property="og:image"]').getAttribute('content');
        return { title, thumbnail };
    } catch (error) {
        console.error(`Error fetching YouTube metadata: ${error}`);
        return { title: '', thumbnail: '' };
    }
}

async function registerRoute() {
    if (currentRoute) {
        let routeName = prompt('경로 이름을 입력하세요:');
        let videoUrl = prompt('유튜브 영상 URL을 입력하세요:');
        const { title, thumbnail } = await fetchYoutubeMetadata(videoUrl);
        let gpxData = generateGPX(currentRoute, routeName);
        let startMarker = L.marker(currentRoute.getLatLngs()[0], { icon: startIcon }).addTo(map);
        L.popup({ closeOnClick: false, autoClose: false })
            .setLatLng(currentRoute.getLatLngs()[0])
            .setContent(routeName)
            .openOn(map);
        let endMarker = L.marker(currentRoute.getLatLngs()[currentRoute.getLatLngs().length - 1], { icon: endIcon }).addTo(map);
        let uuid = generateUUID();
        currentRoute.on('click', onRouteClick);
        currentRoute.on('mouseover', onRouteMouseOver);
        currentRoute.on('mouseout', onRouteMouseOut);
        routes.push({ 
            id: uuid, 
            route: currentRoute, 
            routeName: routeName, 
            videoUrl: videoUrl, 
            gpxData: gpxData, 
            startMarker: startMarker, 
            endMarker: endMarker, 
            thumbnail: thumbnail, 
            title: title 
        });
        addRouteToList(currentRoute, routeName, videoUrl, uuid, thumbnail, title);
        currentRoute = null;
        currentRoutePoints = [];
        cancelRouteCreation();
    } else {
        alert('경로를 먼저 선택하세요.');
    }
    document.getElementById('controls').style.display = 'none';
}

async function registerGpxRoute() {
    if (currentRoute) {
        let routeName = prompt('경로 이름을 입력하세요:');
        let videoUrl = prompt('유튜브 영상 URL을 입력하세요:');
        const { title, thumbnail } = await fetchYoutubeMetadata(videoUrl);
        let gpxData = generateGPX(currentRoute, routeName);
        let startMarker = L.marker(currentRoute.getLatLngs()[0], { icon: startIcon }).addTo(map);
        L.popup({ closeOnClick: false, autoClose: false })
            .setLatLng(currentRoute.getLatLngs()[0])
            .setContent(routeName)
            .openOn(map);
        let endMarker = L.marker(currentRoute.getLatLngs()[currentRoute.getLatLngs().length - 1], { icon: endIcon }).addTo(map);
        let uuid = generateUUID();
        currentRoute.on('click', onRouteClick);
        currentRoute.on('mouseover', onRouteMouseOver);
        currentRoute.on('mouseout', onRouteMouseOut);
        routes.push({ 
            id: uuid, 
            route: currentRoute, 
            routeName: routeName, 
            videoUrl: videoUrl, 
            gpxData: gpxData, 
            startMarker: startMarker, 
            endMarker: endMarker, 
            thumbnail: thumbnail, 
            title: title 
        });
        addRouteToList(currentRoute, routeName, videoUrl, uuid, thumbnail, title);
        currentRoute = null;
        cancelGpxRouteCreation();
    } else {
        alert('GPX 파일을 먼저 열어주세요.');
    }
    document.getElementById('controls').style.display = 'none';
}

function cancelRouteCreation() {
    if (currentRoute) {
        map.removeLayer(currentRoute);
        currentRoute = null;
        currentRoutePoints = [];
    }
    routeCreationMode = false;
    document.getElementById('start-route-creation').style.display = '';
    document.getElementById('start-gpx-route-creation').style.display = '';
    document.getElementById('register-route').style.display = 'none';
    document.getElementById('cancel-route-creation').style.display = 'none';
    document.getElementById('play-videos').style.display = '';
    document.getElementById('route-list').style.display = 'block';
    showExistingRoutes();
    document.getElementById('controls').style.display = 'none';
}

function cancelGpxRouteCreation() {
    if (currentRoute) {
        map.removeLayer(currentRoute);
        currentRoute = null;
    }
    gpxRouteCreationMode = false;
    document.getElementById('start-route-creation').style.display = '';
    document.getElementById('start-gpx-route-creation').style.display = '';
    document.getElementById('register-gpx-route').style.display = 'none';
    document.getElementById('cancel-gpx-route-creation').style.display = 'none';
    document.getElementById('play-videos').style.display = '';
    document.getElementById('route-list').style.display = 'block';
    showExistingRoutes();
    document.getElementById('controls').style.display = 'none';
}

function deleteRoute(index) {
    let routeIndex = routes.findIndex(r => r.id === index);
    if (routeIndex !== -1) {
        let route = routes[routeIndex];
        map.removeLayer(route.route);
        map.removeLayer(route.startMarker);
        map.removeLayer(route.endMarker);
        routes.splice(routeIndex, 1);
    }
    let routeItem = document.querySelector(`.route-item[data-index="${index}"]`);
    if (routeItem) {
        routeItem.remove();
    }
    selectedRoutes = selectedRoutes.filter(r => r.id !== index);
    updateRouteIndices();
    updatePlayButtonState();
    updateRouteListMessage(); // Update the message visibility when a route is deleted
}

function updateRouteListMessage() {
    const routeList = document.getElementById('route-list');
    const noRoutesMessage = document.getElementById('no-routes');
    if (routeList.children.length > 1) { // more than the no-routes message
        noRoutesMessage.style.display = 'none';
    } else {
        noRoutesMessage.style.display = 'block';
    }
}

function editRoute(index) {
    let route = routes.find(r => r.id === index);
    if (route) {
        let newUrl = prompt('새로운 유튜브 URL을 입력하세요:', route.videoUrl);
        if (newUrl !== null) {
            fetchYoutubeMetadata(newUrl).then(({ title, thumbnail }) => {
                route.videoUrl = newUrl;
                route.title = title;
                route.thumbnail = thumbnail;
                let link = document.querySelector(`.route-item[data-index="${index}"] a`);
                let titleElem = document.querySelector(`.route-item[data-index="${index}"] p:nth-child(6)`);
                let thumbElem = document.querySelector(`.route-item[data-index="${index}"] img`);
                if (link) {
                    link.href = newUrl;
                    link.textContent = newUrl;
                }
                if (titleElem) {
                    titleElem.textContent = `유튜브 타이틀: ${title}`;
                }
                if (thumbElem) {
                    thumbElem.src = thumbnail;
                }
            });
        }
    }
}

function hideExistingRoutes() {
    routes.forEach(route => {
        map.removeLayer(route.route);
        map.removeLayer(route.startMarker);
        map.removeLayer(route.endMarker);
    });
}

function showExistingRoutes() {
    routes.forEach(route => {
        map.addLayer(route.route);
        map.addLayer(route.startMarker);
        map.addLayer(route.endMarker);
    });
}

function onMapClick(e) {
    if (!routeCreationMode) return;

    if (currentRoutePoints.length > 0) {
        let lastPoint = currentRoutePoints[currentRoutePoints.length - 1];
        getRouteFromOSRM(lastPoint, e.latlng, route => {
            if (currentRoute) {
                currentRoute.setLatLngs(currentRoute.getLatLngs().concat(route));
            } else {
                currentRoute = L.polyline(route, { color: 'red' }).addTo(map);
            }
            currentRoutePoints.push(e.latlng);
        });
    } else {
        currentRoutePoints.push(e.latlng);
        currentRoute = L.polyline([e.latlng], { color: 'red' }).addTo(map);
    }
}

function onRouteClick(e) {
    let route = e.target;
    let index = routes.findIndex(r => r.route === route);
    toggleRouteSelection(route, routes[index].id);
}

function onRouteMouseOver(e) {
    let route = e.target;
    if (!selectedRoutes.includes(route)) {
        route.setStyle({ color: 'orange', weight: 5 });
    }
    let index = routes.findIndex(r => r.route === route);
    let routeItem = document.querySelector(`.route-item[data-index="${routes[index].id}"]`);
    if (routeItem) {
        routeItem.classList.add('hover');
    }
}

function onRouteMouseOut(e) {
    let route = e.target;
    if (!selectedRoutes.includes(route)) {
        route.setStyle({ color: 'red', weight: 3 });
    }
    let index = routes.findIndex(r => r.route === route);
    let routeItem = document.querySelector(`.route-item[data-index="${routes[index].id}"]`);
    if (routeItem) {
        routeItem.classList.remove('hover');
    }
}

function getRouteFromOSRM(start, end, callback) {
    if (!start || !end) {
        console.error('Invalid coordinates for route calculation.');
        return;
    }
    
    let url = `${osrmUrl}${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&steps=true&overview=full`;
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.routes && data.routes[0] && data.routes[0].geometry) {
                let coordinates = data.routes[0].geometry.coordinates;
                let latLngs = coordinates.map(coord => L.latLng(coord[1], coord[0]));
                callback(latLngs);
            } else {
                console.error('No routes found in OSRM response.');
            }
        })
        .catch(error => console.error('Error fetching route from OSRM:', error));
}

function generateGPX(route, routeName) {
    let gpx = '<?xml version="1.0" encoding="UTF-8"?>';
    gpx += '<gpx version="1.1" creator="BikeMap" xmlns="http://www.topografix.com/GPX/1/1">';
    gpx += `<metadata><name>${routeName}</name></metadata>`;
    gpx += '<trk><name>Bike Route</name><trkseg>';
    route.getLatLngs().forEach(point => {
        gpx += `<trkpt lat="${point.lat}" lon="${point.lng}"></trkpt>`;
    });
    gpx += '</trkseg></trk>';
    gpx += '</gpx>';
    return gpx;
}

function downloadGPX(index) {
    let route = routes.find(r => r.id === index);
    if (route) {
        download(`${route.routeName}.gpx`, route.gpxData);
    } else {
        alert('경로를 찾을 수 없습니다.');
    }
}

function download(filename, text) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

function playSelectedVideos() {
    let selectedIndices = getSelectedRouteIndices();
    if (selectedIndices.length === 0) {
        alert('경로를 선택하세요.');
        return;
    }

    let videoUrls = selectedIndices.map(index => {
        let route = routes.find(r => r.id === index);
        return route.videoUrl;
    });

    let playlistUrl = createPlaylistUrl(videoUrls);
    window.open(playlistUrl, '_blank');
}

function createPlaylistUrl(videoUrls) {
    let videoIds = videoUrls.map(url => extractVideoId(url));
    return `https://www.youtube.com/embed?playlist=${videoIds.join(',')}`;
}

function convertToEmbedUrl(url) {
    let videoId = extractVideoId(url);
    return `https://www.youtube.com/embed/${videoId}?si=IbmlSQBeF4ZX4_BM`;
}

function extractVideoId(url) {
    let videoId = null;

    if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1];
    } else if (url.includes('youtube.com/watch?v=')) {
        videoId = url.split('v=')[1];
        let ampersandPosition = videoId.indexOf('&');
        if (ampersandPosition !== -1) {
            videoId = videoId.substring(0, ampersandPosition);
        }
    } else if (url.includes('youtube.com/embed/')) {
        videoId = url.split('embed/')[1];
        let questionMarkPosition = videoId.indexOf('?');
        if (questionMarkPosition !== -1) {
            videoId = videoId.substring(0, questionMarkPosition);
        }
    }

    return videoId;
}

function addRouteToList(route, routeName, videoUrl, index, thumbnail, title) {
    let routeList = document.getElementById('route-list');
    let routeItem = document.createElement('div');
    routeItem.classList.add('route-item');
    routeItem.dataset.index = index;

    let start = route.getLatLngs()[0];
    let end = route.getLatLngs().length > 1 ? route.getLatLngs()[route.getLatLngs().length - 1] : start;

    routeItem.innerHTML = `
        <img src="${thumbnail}" alt="Thumbnail">
        <div class="route-details">
            <p class="route-name">${routeName}</p>
            <p class="route-youtube-title">${title}</p>
        </div>
        <input type="checkbox" class="route-checkbox" data-index="${index}" style="display: none;">
        <p style="display: none;">시작 지점: ${start.lat.toFixed(5)}, ${start.lng.toFixed(5)}</p>
        <p style="display: none;">끝 지점: ${end.lat.toFixed(5)}, ${end.lng.toFixed(5)}</p>
        <p style="display: none;">유튜브 URL: <a href="${videoUrl}" target="_blank">${videoUrl}</a></p>
        <div class="button-container">
            <button onclick="deleteRoute('${index}')">❌</button>
            <button onclick="editRoute('${index}')">✏️</button>
            <button onclick="downloadGPX('${index}')">G</button>
        </div>
        <hr>
    `;

    routeItem.querySelector('.route-checkbox').addEventListener('change', () => toggleRouteSelection(route, index));
    routeItem.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT' && !e.target.classList.contains('button-container')) {
            toggleRouteSelection(route, index);
        }
    });
    routeItem.addEventListener('mouseover', () => highlightRoute(route, index));
    routeItem.addEventListener('mouseout', () => unhighlightRoute(route, index));

    routeList.appendChild(routeItem);
    updatePlayButtonState();
    updateRouteListMessage(); // Update the message visibility when a route is added
}

function updateRouteIndices() {
    const routeItems = document.querySelectorAll('.route-item');
    routeItems.forEach((item, index) => {
        item.dataset.index = routes[index]?.id || '';
        const checkbox = item.querySelector('.route-checkbox');
        const deleteButton = item.querySelector('.button-container button:nth-child(1)');
        const editButton = item.querySelector('.button-container button:nth-child(2)');
        const downloadButton = item.querySelector('.button-container button:nth-child(3)');
        if (checkbox) checkbox.dataset.index = routes[index]?.id || '';
        if (deleteButton) deleteButton.setAttribute('onclick', `deleteRoute('${routes[index]?.id || ''}')`);
        if (editButton) editButton.setAttribute('onclick', `editRoute('${routes[index]?.id || ''}')`);
        if (downloadButton) downloadButton.setAttribute('onclick', `downloadGPX('${routes[index]?.id || ''}')`);
    });
    routes.forEach(route => {
        route.route.off('click');
        route.route.off('mouseover');
        route.route.off('mouseout');
        route.route.on('click', onRouteClick);
        route.route.on('mouseover', onRouteMouseOver);
        route.route.on('mouseout', onRouteMouseOut);
    });
}

function getSelectedRouteIndices() {
    let checkboxes = document.querySelectorAll('.route-checkbox:checked');
    let selectedIndices = Array.from(checkboxes).map(checkbox => checkbox.dataset.index);
    return selectedIndices;
}

function toggleRouteSelection(route, index) {
    let checkbox = document.querySelector(`.route-checkbox[data-index="${index}"]`);
    let routeItem = document.querySelector(`.route-item[data-index="${index}"]`);

    if (selectedRoutes.includes(route)) {
        selectedRoutes = selectedRoutes.filter(r => r !== route);
        route.setStyle({ color: 'red', weight: 3 });
        if (routeItem) {
            routeItem.classList.remove('selected');
        }
        if (checkbox) {
            checkbox.checked = false;
        }
    } else {
        selectedRoutes.push(route);
        route.setStyle({ color: 'blue', weight: 5 });
        if (routeItem) {
            routeItem.classList.add('selected');
        }
        if (checkbox) {
            checkbox.checked = true;
        }
    }
    updatePlayButtonState();
}

function highlightRoute(route, index) {
    if (!selectedRoutes.includes(route)) {
        route.setStyle({ color: 'orange', weight: 5 });
    }
    let routeItem = document.querySelector(`.route-item[data-index="${index}"]`);
    if (routeItem) {
        routeItem.classList.add('hover');
    }
}

function unhighlightRoute(route, index) {
    if (!selectedRoutes.includes(route)) {
        route.setStyle({ color: 'red', weight: 3 });
    }
    let routeItem = document.querySelector(`.route-item[data-index="${index}"]`);
    if (routeItem) {
        routeItem.classList.remove('hover');
    }
}

function updatePlayButtonState() {
    let selectedIndices = getSelectedRouteIndices();
    document.getElementById('play-videos').disabled = selectedIndices.length === 0 || routes.length === 0;
    document.getElementById('export-routes').disabled = routes.length === 0;
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// YouTube API ready
function onYouTubeIframeAPIReady() {
    // This function is required for the YouTube IFrame API to work
}

function exportRoutes() {
    const routesData = routes.map(route => ({
        id: route.id,
        routeName: route.routeName,
        videoUrl: route.videoUrl,
        thumbnail: route.thumbnail,
        title: route.title
    }));

    const json = JSON.stringify(routesData, null, 2);
    download('routes.json', json);

    routes.forEach(route => {
        download(`routes_${route.id}.gpx`, route.gpxData);
    });
}

async function loadInitialRoutes(fileName) {
    const fileBaseName = fileName.replace(/\.[^/.]+$/, ""); // 확장자 제거
    try {
        const jsonResponse = await fetch(`assets/preroutes/${fileBaseName}.json`);
        if (!jsonResponse.ok) {
            throw new Error('Error loading initial route file');
        }

        const data = await jsonResponse.json();
        const latLngBounds = [];

        for (const route of data) {
            const gpxResponse = await fetch(`assets/preroutes/${fileBaseName}/routes_${route.id}.gpx`);
            if (!gpxResponse.ok) {
                throw new Error(`Error loading GPX file for route ${route.id}`);
            }

            const gpxData = await gpxResponse.text();
            const latLngs = parseGPXToLatLngs(gpxData);
            const routePolyline = L.polyline(latLngs, { color: 'red' }).addTo(map);
            const startMarker = L.marker(latLngs[0], { icon: startIcon }).addTo(map);
            L.popup({ closeOnClick: false, autoClose: false })
                .setLatLng(latLngs[0])
                .setContent(route.routeName)
                .openOn(map);
            const endMarker = L.marker(latLngs[latLngs.length - 1], { icon: endIcon }).addTo(map);

            routePolyline.on('click', onRouteClick);
            routePolyline.on('mouseover', onRouteMouseOver);
            routePolyline.on('mouseout', onRouteMouseOut);

            routes.push({
                id: route.id,
                route: routePolyline,
                routeName: route.routeName,
                videoUrl: route.videoUrl,
                gpxData: gpxData,
                startMarker: startMarker,
                endMarker: endMarker,
                thumbnail: route.thumbnail,
                title: route.title
            });

            addRouteToList(routePolyline, route.routeName, route.videoUrl, route.id, route.thumbnail, route.title);
            latLngBounds.push(...latLngs);
        }

        if (latLngBounds.length > 0) {
            map.fitBounds(latLngBounds);
        }
        updatePlayButtonState();
    } catch (error) {
        console.error(error);
    }
}

function parseGPXFiles(gpxText) {
    const parser = new DOMParser();
    const gpxDoc = parser.parseFromString(gpxText, 'application/xml');
    const tracks = gpxDoc.getElementsByTagName('trk');
    const gpxMap = {};

    Array.from(tracks).forEach((track) => {
        const id = track.getElementsByTagName('name')[0].textContent;
        gpxMap[id] = new XMLSerializer().serializeToString(track);
    });

    return gpxMap;
}

function parseGPXToLatLngs(gpxData) {
    let parser = new DOMParser();
    let xmlDoc = parser.parseFromString(gpxData, 'application/xml');
    let trkpts = xmlDoc.getElementsByTagName('trkpt');
    let latLngs = [];
    for (let i = 0; i < trkpts.length; i++) {
        let lat = parseFloat(trkpts[i].getAttribute('lat'));
        let lon = parseFloat(trkpts[i].getAttribute('lon'));
        latLngs.push([lat, lon]);
    }
    return latLngs;
}
