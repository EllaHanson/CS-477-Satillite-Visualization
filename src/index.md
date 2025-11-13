---
toc: false
---

<div class="page">
  <div class="map"></div>
  <div class="context">
    <h1>Notes</h1>
    <p>This is the map layout.</p>
  </div>
</div>

<style>
  /* entire webpage */
.page {
    display: grid;
    grid-template-columns: 55% 45%;
    height: 100vh; 
}

/* map of left side */
.map {
    position: sticky;
    top: 0;
    height: 100vh;
    border-right: 1px solid #e5e7eb;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #f0f0f0;
}

.map svg {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  display: block;
}

/* text on the right */
.context {
    height : 100vh;
    overflow: auto;
    padding: 2rem;
}
</style>


```js
import * as d3 from "npm:d3"
import * as topojson from "npm:topojson-client"

const width = 960;
const height = 500;

const projection = d3.geoEquirectangular();
const path = d3.geoPath(projection);

const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
const countries = topojson.feature(world, world.objects.countries);
const country_borders = topojson.mesh(world, world.objects.countries, (a,b) => a !== b);

const mapDiv = document.querySelector(".page .map");

const svg = d3.create("svg");

svg.append("path")
  .datum(countries)
  .attr("fill", "#ccc")
  .attr("stroke", "#333")
  .attr("d", path);

mapDiv.appendChild(svg.node());
```