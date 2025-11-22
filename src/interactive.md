---
toc: false
title: Interaction
---

<div class="page">
    <h1>Satellite Interaction</h1>
    <label class="dropdown-area">
        View Specific Country
        <select id="selector"></select>
    </label>
    <label class="dropdown-area">
        Show Satellites from
        <select id="sat_selector"></select>
    </label>
    <div class="map"></div>
</div>

<style>
    /* entire webpage */
.page {
    display: grid;
    height: 100vh; 
}

/* globe */
.map {
    position: sticky;
    top: 0;
    height: 100vh;
    border-right: 1px solid #e5e7eb;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #222;
}

.map svg {
  max-width: 100%;
  max-height: 100%;
  width: 100%;
  height: auto;
  display: block;
}

/* dropdown */
.dropdown-area {
    display: inline-grid;
}

.dropdown-area select {
    background: #0e0e0e;
}


</style>

```js

import * as d3 from "npm:d3"
import * as topojson from "npm:topojson-client"

const width = 960;
const height = 960;

// const projection = d3.geoEquirectangular();
//const projection = d3.geoNaturalEarth1();
// const projection = d3.geoEqualEarth();
// const projection = d3.geoMercator();
const projection = d3.geoOrthographic().clipAngle(90);
projection.fitSize([width, height], { type: "Sphere" });

const path = d3.geoPath(projection);

const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
const countries = topojson.feature(world, world.objects.countries);
const country_borders = topojson.mesh(world, world.objects.countries, (a,b) => a !== b);
const mapDiv = document.querySelector(".page .map");

const countryCenter = countries.features.map(d => {
    const [lon, lat] = d3.geoCentroid(d);
    return { name: d.properties.name, lon, lat };
});


/* data wrangling */

const input_file = await FileAttachment("./data/info.tsv").text();
const satellites = d3.tsvParse(input_file);

console.log("Satellites loaded:", satellites.length, "rows");
console.log("Columns:", satellites.columns);
console.log("First rows:", satellites.slice(0, 3));

const sat_data = d3.rollups(
    satellites.filter(i => i["Launch Site"] && i["Launch Site"].trim()),
    count => count.length,
    i => i["Launch Site"].trim()
).sort((a,b) => d3.descending(a[1], b[1]));

console.log("dist launch sites: ", sat_data.length)
console.table(sat_data.slice(0, 40));

const coord_text = await FileAttachment("./data/coords.tsv").text();
const launch_sites = d3.tsvParse(coord_text);
const coord_map = new Map (
    launch_sites.map(i => [i.Site.trim(), [+i.Longitude, +i.Latitude]])
)

const data = [];
for (const i of satellites) {
    const site = i["Launch Site"] && i["Launch Site"].trim();
    if (!site) continue;
    const coord = coord_map.get(site);
    if (!coord) continue;
    data.push({...i, coord})
}

function coord_to_country(lon, lat) {
    let found = null;
    for (const x of countries.features) {
        if  (d3.geoContains(x, [lon, lat])) {
            found = x.properties.name;
            break;
        }
    }
    return found;
}

for (const x of data) {
    if (!x.coord) continue;
    const country = coord_to_country(x.coord[0], x.coord[1]);
    if (country) {
        x.launch_country = country;
    }
}


```



```js

const svg = d3.create("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("preserveAspectRatio", "xMidYMid meet")
  .style("width", "100%")
  .style("height", "100%");


svg.append("path")
  .datum({ type: "Sphere" })
  .attr("fill", "#555")
  .attr("stroke", "#111")
  .attr("stroke-width", 0.5)
  .attr("d", path);

/* all the individual countries */
svg.append("g")
  .selectAll("path")
  .data(countries.features)
  .join("path")
  .attr("class", "country")
  .attr("fill", "#ccc")
  .attr("stroke", "#111")
  .attr("stroke-width", 0.5)
  .attr("d", path);


mapDiv.appendChild(svg.node());

/* transition logic */

/* transition */
function flyTo({lon, lat, scale}) {
  /* current settings */
  const startCenter = projection.rotate();
  const startScale = projection.scale();

  /* smooth transitions */
  const trans_center = d3.interpolateArray(startCenter, [-lon, -lat, 0]);
  const trans_scale = d3.interpolateNumber(startScale, scale ?? startScale);
  const time = 1500;

  d3.select(svg.node())
    .transition()
    .duration(time)
    .ease(d3.easeCubicInOut)
    .tween("projection", () => t => {
      projection.rotate(trans_center(t));
      projection.scale(trans_scale(t));
      svg.selectAll("path").attr("d", path);
    });

}

const defaultFill = "#ccc";
const highlightFill = "#60a5fa";

function highlightCountry(country_name) {
    svg.selectAll(".country")
        .transition()
        .duration(2000)
        .ease(d3.easeCubicOut)
        .attr("fill", i => {
            if (!country_name) return defaultFill;
            if (i.properties.name === country_name) return highlightFill;
            return defaultFill;
        });
}

const sat_stroke = "#b71aa5ff"
const sat_stroke_width = 3;

function highlightSatelliteCountry(country_name) {
    svg.selectAll(".country")
        .transition()
        .duration(1000)
        .ease(d3.easeCubicOut)
        .attr("stroke", i => {
            if (i.properties.name === country_name) return sat_stroke;
            else return "#111";
        })
        .attr("stroke-width", i => {
            if (i.properties.name === country_name) return sat_stroke_width;
            else return 0.5
        })
}

/* arrays for dropdown options */

const country_options = [
    /* default option */
    { label: "Select a Region", view: null },
    /* spread each country into diff array elements */
    ...countryCenter
        /* sort alphabetacaly */
        .sort((a,b) => a.name.localeCompare(b.name))
        /* return data */
        .map(i => ({
            label: i.name,
            view: {
                lon: i.lon,
                lat: i.lat,
                scale: projection.scale()
            }
        }))

];

const satellite_options = [
    { label: "Select countries satellites", name: null },
    ...countryCenter
        .sort((a,b) => a.name.localeCompare(b.name))
        .map(i => ({
            label: i.name,
            name: i.name
        }))
];


/* viewing country transition */

const selector = d3.select("#selector");
selector.selectAll("option")
    /* grab array of all countries */
    .data(country_options)
    /* make selection labels */
    .join("option")
        .attr("value", i => {
            if (i.view) return JSON.stringify(i.view);
            else return "";
        })
        .text(i => i.label);

/* when selection is made */
selector.on("change", function () {
    /* grab value of option selected */
    const index = this.selectedIndex;
    const option = d3.select(this).selectAll("option").data()[index];
    const { label, view } = option;
    /* if going back to default option, then do nothing */
    if (!view) {
        highlightCountry(null);
        return;
    }

    /* call transition helpers with correct country data */
    flyTo({ lon: view.lon, lat: view.lat, scale: view.scale });
    highlightCountry(label);
})

/* countries satellites transition */

const sat_selector = d3.select("#sat_selector");
sat_selector.selectAll("option")
    .data(satellite_options)
    .join("option")
        .attr("value", i => {
            if (i.name) return i.name;
            else return "";
        })
        .text(i => i.label);

sat_selector.on("change", function () {
    const value = d3.select(this).property("value");

    if (!value) {
        highlightSatelliteCountry(null);
        return;
    }
    highlightSatelliteCountry(value);
})

/* launch site dots */
const launches = svg.append("g").attr("class", "launch-site");

function drawLaunchSites(country_name) {
    /* grabbing launch-site instances */
    launches.selectAll("*").remove();
    if (!country_name) return;

    const relevant = data.filter( i => i.launch_country === country_name);

    const site_info = d3.rollups(
        relevant, 
        v => v.length, 
        i => i["Launch Site"]?.trim()
    );

    const launch_point = site_info.map(([site, count]) => {
        /* get any instance of coordinates for the launch site */
        const find_coord = relevant.find(r => r["Launch Site"]?.trim() === site && r.coord);

        if (find_coord) {
            return {site, count, coord: find_coord.coord };
        }
        else {
            return null;
        }
    }).filter(Boolean);

    const rad = d3.scaleSqrt()
        .domain([1, d3.max(launch_point, d => d.count)])
        .range([2,10]);
    
    launches.selectAll("circle")
        .ojnfesnosojnvsdjnosvd

}


```