---
toc: false
title: Interaction
---

<div class="page">
    <h1>Satellite Interaction</h1>
    <div class="header">
        <label class="dropdown-area">
            <select id="selector"></select>
        </label>
        <label class="dropdown-area">
            <select id="sat_selector"></select>
        </label>
    </div>
    <div class="map"></div>
    <div class="info-panel">
        <h2 id="country-name"> Choose a Country </h2>
        <div id="country-stats"></div>
    </div>
</div>

<style>
    /* entire webpage */
.page {
    display: grid;
    grid-template-rows: min-content min-content 1fr; 
    grid-template-columns: 3fr 1fr;
    height: 100vh; 
}

.page > h1 {
    grid-row: 1;
    grid-column: 1/3;
}

.page > .map { grid-row: 3; grid-column: 1 }
.page > .info-panel { grid-row: 3; grid-column: 2 }


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

/* right side info */
.info-panel {
    padding: 1rem;
    color: #f1f1f1;
    background: #444;
    border-radius: 1rem;
    margin: 1rem;
}

/* dropdown pannels */
.header {
    grid-row: 2;
    grid-column: 1 / 3;
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    align-items: center; 
    padding: 1rem;
}

.dropdown-area {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
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

function getOwnerCountry(line) {
    const temp = line["Country of Operator/Owner"];
    if (temp) {
        return temp.trim();
    }
    return "Unknown"
}

/* launch data */
const data = [];
for (const i of satellites) {
    /* site name */
    const site = i["Launch Site"] && i["Launch Site"].trim();
    if (!site) continue;
    const coord = coord_map.get(site);
    if (!coord) continue;
    /* add site name, coords, and owner country to launch data */
    data.push({...i, coord, owner_country: getOwnerCountry(i) })
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
      launches.selectAll("circle")
        .attr("transform", d => {
            const [x, y] = projection(d.coord);
            return `translate(${x}, ${y})`;
            })
    });

}

const defaultFill = "#ccc";
const highlightFill = "#60a5fa";

/* blue shading for viewing country */
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

/* boarder around countries that satillites are being displayed for */
/* can be connected to satillite projections */
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

/* satellite owner dropdown */
const satellite_options = [
    { label: "Select countries satellites", name: null },
    ...countryCenter
        .sort((a,b) => a.name.localeCompare(b.name))
        .map(i => ({
            label: i.name,
            name: i.name
        }))
];


/* transitions */
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
        drawLaunchSites(null);
        document.getElementById("country-name").textContent = "Choose a Country";
        writeCountryStats(null)
        return;
    }

    /* call transition helpers with correct country data */
    flyTo({ lon: view.lon, lat: view.lat, scale: view.scale });
    /* setting info panel text */
    document.getElementById("country-name").textContent = label;
    /* country coloring */
    highlightCountry(label);
    /* launch circles withing countries */
    drawLaunchSites(label);
    writeCountryStats(label);
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
    /* if country name not found then just return */
    if (!country_name) return;

    /* get only launch sites in selected country */
    const relevant = data.filter( i => i.launch_country === country_name);

    /* group by launch site and find count (length) of launches */
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

    if (!launch_point.length) {
        return;
    }

    const rad = d3.scaleSqrt()
        .domain([1, d3.max(launch_point, d => d.count)])
        .range([2,10]);
    
    launches.selectAll("circle")
        /* set key to site name */
        .data(launch_point, d => d.site)
        .join("circle")
        .attr("transform", d => {
            const [x, y] = projection(d.coord);
            return `translate(${x},${y})`
        })
        .attr("r", d => rad(d.count))
        /* style */
        .attr("fill", "#af3030ff")
        .attr("fill-opacity", 0.9)
        .attr("stroke", "#111")
        .attr("stroke-width", 0.5)
        /* for hovering over site */
        .append("title")
        /* text for hover */
        .text(d => `${d.site}: ${d.count} launches`)
}

function writeCountryStats(countryName) {
    /* right element */
    const panel = document.getElementById("country-stats");

    /* check that country name exists */
    if (!countryName) {
        panel.innerHTML = "";
        return;
    }

    const relevant = data.filter(d => d.launch_country === countryName);
    const tot_launch_count = relevant.length;

    /* total site launch counts */
    const sites_grouped = d3.rollups(
        relevant,
        v => v.length,
        d => d["Launch Site"]?.trim()
    )
    .filter( i => {
        const site = i[0];
        if (site && site.trim() !== "") {
            return true;
        }
        else {
            return false;
        }})
    .sort((a, b) => d3.descending(a[1], b[1]));

    /* count for each site */
    const distinct_sites = sites_grouped.length;

    const sat_owners = sites_grouped.map(input => {
        const site = input[0];
        const site_count = input[1];

        const rows = relevant.filter(r => {
            return r["Launch Site"] && r["Launch Site"].trim() === site;
        })

        /* names of all the countries that have launched from this site */
        const owner_names = d3.rollups(
            rows,
            v => v.length,
            r => {
                if (r.owner_country) {
                    return r.owner_country;
                }
                else {
                    return "Unknown"
                }
            }
        ).sort((a, b) => d3.descending(a[1], b[1]) );

        const top_owners = owner_names.slice(0, 3);
        const rem_count = owner_names.length - top_owners.length;

        /* grab lines from data with specific country name */
        let owners_lines = top_owners.map(input => {
            const owner = input[0];
            const count = input[1];
            return `<li class="owner-line">${owner}: ${count}</li>`;
        }).join("");

        if (rem_count > 0) {
            owners_lines += `<li class="owner-line" style="opacity:.75">and ${rem_count} more...</li>`;
        }
        
        return `<li class="site-line">
                    <strong>${site}</strong>: ${site_count}
                    <ul class="owners-list">${owners_lines}</ul>
                </li>`;
    }).join("");

    /* html for data */
    panel.innerHTML = `
        <p><strong>Total launches from this country:</strong> ${tot_launch_count}</p>
        <p><strong>Distinct launch sites:</strong> ${distinct_sites}</p>
        ${sat_owners ? `<p><strong>Sites and owners:</strong></p><ul class="sites-list">${sat_owners}</ul>` : ""}
    `;
}


```