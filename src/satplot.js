import * as d3 from "npm:d3"
import * as topojson from "npm:topojson-client"
import { FileAttachment } from "observablehq:stdlib";

export async function createSatelliteGlobe2({
  container,
  width = 960,
  height = 960
}) {

  // ---- projection & path ----
  const projection = d3.geoOrthographic().clipAngle(90);
  projection.fitSize([width, height], { type: "Sphere" });

  const path = d3.geoPath(projection);

  // ---- world data ----
  const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
  const countries = topojson.feature(world, world.objects.countries);
  const country_borders = topojson.mesh(world, world.objects.countries, (a, b) => a !== b);

  const countryCenter = countries.features.map(d => {
    const [lon, lat] = d3.geoCentroid(d);
    return { name: d.properties.name, lon, lat };
  });

  // ---- satellite table & launch sites ----
  const input_file = await FileAttachment("data/info.tsv").text();
  const satellitesRaw = d3.tsvParse(input_file);   // original full rows

  const parseLaunchDate = d3.timeParse("%m/%d/%y"); // adjust format if needed

const satellites = satellitesRaw.map(d => {
  const launchDateStr = d["Date of Launch"];
  const launchDate = launchDateStr ? parseLaunchDate(launchDateStr.trim()) : null;

  return {
    raw: d,
    name: d["Current Official Name of Satellite"] ??
          d["Name of Satellite, Alternate Names"],
    registryCountry: d["Country/Org of UN Registry"]?.trim(),
    operatorCountry: d["Country of Operator/Owner"]?.trim(),
    purpose: d["Purpose"]?.trim(),
    detailedPurpose: d["Detailed Purpose"]?.trim(),
    orbitClass: d["Class of Orbit"],
    orbitType: d["Type of Orbit"],
    perigee: +d["Perigee (km)"],
    apogee: +d["Apogee (km)"],
    inclination: +d["Inclination (degrees)"],
    period: +d["Period (minutes)"],
    norad: d["NORAD Number"],
    cospar: d["COSPAR Number"],
    launchDate,
    launchYear: launchDate ? launchDate.getFullYear() : null
  };
});




  const coord_text = await FileAttachment("data/coords.tsv").text();
  const launch_sites = d3.tsvParse(coord_text);
  const coord_map = new Map(
    launch_sites.map(i => [i.Site.trim(), [+i.Longitude, +i.Latitude]])
  );

  function getOwnerCountry(line) {
    const temp = line["Country of Operator/Owner"];
    if (temp) {
      return temp.trim();
    }
    return "Unknown";
  }

  // ---- launch data (unchanged behavior) ----
  const data = [];
  for (const i of satellitesRaw) {
    const site = i["Launch Site"] && i["Launch Site"].trim();
    if (!site) continue;
    const coord = coord_map.get(site);
    if (!coord) continue;
    data.push({ ...i, coord, owner_country: getOwnerCountry(i) });
  }

  function coord_to_country(lon, lat) {
    let found = null;
    for (const x of countries.features) {
      if (d3.geoContains(x, [lon, lat])) {
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

  // ---- NEW: normalized satellites + ground tracks ----

  // normalize / pick the fields we care about for orbits


  function makeGroundTrack(sat, { numPoints = 200, numOrbits = 1 } = {}) {
    const incDeg = sat.inclination || 0;
    const coords = [];
    const totalAngle = 2 * Math.PI * numOrbits;

    for (let i = 0; i <= numPoints; i++) {
      const t = (totalAngle * i) / numPoints;

      const lat = Math.sin(t) * incDeg;
      let lon = (t * 180 / Math.PI) % 360;
      if (lon > 180) lon -= 360;

      coords.push([lon, lat]);
    }
    return coords;
  }

  // 1) First compute ground tracks for all satellites
satellites.forEach(s => {
  s.groundTrack = makeGroundTrack(s, { numPoints: 300, numOrbits: 1 });
});

// 2) Group satellites that are effectively on the "same" orbit
//    (you can tweak the key if you like)



  const satellitesByCountry = d3.group(
    satellites.filter(d => d.operatorCountry),
    d => d.operatorCountry
  );

  // ---- SVG + base layers ----
  const svg = d3.create("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "100%");


svg.append("path")
  .datum({ type: "Sphere" })
  .attr("class", "sphere")
  .attr("fill", "#dbeafe")      // ocean
  .attr("stroke", "#93c5fd")    // old border color
  .attr("stroke-width", 0.7)
  .attr("d", path);


// land
svg.append("g")
  .attr("class", "countries")
  .selectAll("path")
  .data(countries.features)
  .join("path")
  .attr("class", "country")
  .attr("fill", "#e5e5c7")      // light land/beige
  .attr("stroke", "#64748b")    // muted border
  .attr("stroke-width", 0.6)
  .attr("d", path);


  // NEW: layer for satellites
  const satellitesLayer = svg.append("g").attr("class", "satellites-layer");

  // launch-site dots layer (existing)
  const launches = svg.append("g").attr("class", "launch-site");

  container.appendChild(svg.node());

  // ---- transitions ----
function flyTo({ lon, lat, scale }) {
  const startCenter = projection.rotate();
  const startScale = projection.scale();

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

      // re-project base geography
      svg.selectAll("path.sphere, path.country").attr("d", path);

      // re-project tracks
      satellitesLayer.selectAll("path.satellite-track")
        .attr("d", d => path({
          type: "LineString",
          coordinates: d.groundTrack
        }));

      // re-project dots, always picking a visible coord
      satellitesLayer.selectAll("circle.satellite-dot")
        .attr("transform", d => {
          const coord = getVisibleCoordOnTrack(d);
          if (!coord) return "translate(-1000,-1000)";
          const [x, y] = projection(coord);
          return (isFinite(x) && isFinite(y))
            ? `translate(${x},${y})`
            : "translate(-1000,-1000)";
        });

      // launch sites (your existing code)
      launches.selectAll("circle")
        .attr("transform", d => {
          const [x, y] = projection(d.coord);
          return `translate(${x}, ${y})`;
        });
    });
}




function getVisibleCoordOnTrack(sat) {
  const track = sat.groundTrack;
  if (!track || !track.length) return null;

  // current center of the globe in lon/lat
  const center = projection.invert([width / 2, height / 2]) || [0, 0];

  const maxAngle = Math.PI / 2 - 0.02; // a tiny margin inside the horizon
  const N = track.length;

  // start around this satellite's "phase" index so spreading still works
  const startIdx = Math.floor((sat.phase || 0) * (N - 1));

  // search forward along the track, wrapping around
  for (let k = 0; k < N; k++) {
    const idx = (startIdx + k) % N;
    const candidate = track[idx];
    const ang = d3.geoDistance(center, candidate); // in radians
    if (ang <= maxAngle) return candidate;
  }

  // fallback: nothing clearly visible, just return null
  return null;
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

  const sat_stroke = "#b71aa5ff";
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
        else return 0.5;
      });
  }

  function drawLaunchSites(country_name) {
    launches.selectAll("*").remove();
    if (!country_name) return;

    const relevant = data.filter(i => i.launch_country === country_name);

    const site_info = d3.rollups(
      relevant,
      v => v.length,
      i => i["Launch Site"]?.trim()
    );

    const launch_point = site_info.map(([site, count]) => {
      const find_coord = relevant.find(
        r => r["Launch Site"]?.trim() === site && r.coord
      );
      if (find_coord) {
        return { site, count, coord: find_coord.coord };
      } else {
        return null;
      }
    }).filter(Boolean);

    if (!launch_point.length) return;

    const rad = d3.scaleSqrt()
      .domain([1, d3.max(launch_point, d => d.count)])
      .range([2, 10]);

    launches.selectAll("circle")
      .data(launch_point, d => d.site)
      .join("circle")
      .attr("transform", d => {
        const [x, y] = projection(d.coord);
        return `translate(${x},${y})`;
      })
      .attr("r", d => rad(d.count))
      .attr("fill", "#af3030ff")
      .attr("fill-opacity", 0.9)
      .attr("stroke", "#111")
      .attr("stroke-width", 0.5)
      .append("title")
      .text(d => `${d.site}: ${d.count} launches`);
  }

  // ---- NEW: draw satellites (dot + dotted ground track) ----
function drawSatellites(sats = []) {
  // tracks (unchanged except your style tweaks)
  const tracks = satellitesLayer
    .selectAll("path.satellite-track")
    .data(
      sats.filter(d => d.groundTrack && d.groundTrack.length),
      d => d.norad || d.name
    );

  const tracksEnter = tracks.enter()
  .append("path")
  .attr("class", "satellite-track")
  .attr("fill", "none")
  .attr("stroke", "#ff0000")      // 🔴 red tracks  .attr("stroke-width", 3)
  .attr("stroke-linecap", "round")
  .attr("stroke-dasharray", "6,12");


  tracksEnter.merge(tracks)
    .attr("d", d => path({
      type: "LineString",
      coordinates: d.groundTrack
    }));

  tracks.exit().remove();


  // dots
  const dots = satellitesLayer
    .selectAll("circle.satellite-dot")
    .data(
      sats.filter(d => d.groundTrack && d.groundTrack.length),
      d => d.norad || d.name
    );

  const dotsEnter = dots.enter()
    .append("circle")
    .attr("class", "satellite-dot")
    .attr("r", 3)
    .attr("fill", "#ffeb3b")
    .attr("fill-opacity", 0.9)
    .attr("stroke", "#000")
    .attr("stroke-width", 0.7);

  const dotsMerged = dotsEnter.merge(dots)
    .attr("transform", d => {
      const coord = getVisibleCoordOnTrack(d);
      if (!coord) return "translate(-1000,-1000)";
      const [x, y] = projection(coord);
      return (isFinite(x) && isFinite(y))
        ? `translate(${x},${y})`
        : "translate(-1000,-1000)";
    });

  dots.exit().remove();

  // keep your pulse animation if you had it:
  pulseSatellites(dotsMerged);
}





function pulseSatellites(selection) {
  // stop any previous transitions on these elements
  selection.interrupt();

  // one full pulse cycle: grow a bit + fade, then shrink
  function repeat(sel) {
    sel
      .transition()
      .duration(1500)
      .ease(d3.easeCubicInOut)
      .attr("r", 6)           // max radius
      .attr("fill-opacity", 1)
      .transition()
      .duration(1500)
      .ease(d3.easeCubicInOut)
      .attr("r", 3)           // back to base radius
      .attr("fill-opacity", 0.6)
      .on("end", function() {
        // recurse on this element to keep pulsing
        repeat(d3.select(this));
      });
  }

  repeat(selection);
}
// 1) build a ground track for each satellite
satellites.forEach(sat => {
  sat.groundTrack = makeGroundTrack(sat, { numPoints: 300, numOrbits: 1 });
});

// 2) group satellites that share an orbit and assign a phase (0–1)
//    tweak the key if needed
const satellitesByOrbit = d3.group(
  satellites,
  d => `${d.orbitClass}|${d.orbitType}|${Math.round(d.inclination)}`
);

for (const group of satellitesByOrbit.values()) {
  const n = group.length;
  group.forEach((sat, j) => {
    sat.phase = j / n; // evenly spaced along orbit
  });
}




  // ---- what this module exposes ----
  return {
  svg,
  projection,
  countries,
  data, // launch sites
  satellites,          // <--- add this
  satellitesByCountry,
  countryCenter,
  flyTo,
  highlightCountry,
  highlightSatelliteCountry,
  drawLaunchSites,
  drawSatellites
};

}
