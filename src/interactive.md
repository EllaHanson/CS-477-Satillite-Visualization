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


```