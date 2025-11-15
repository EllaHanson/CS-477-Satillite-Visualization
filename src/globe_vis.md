---
title: Globe Visualization
---
<div class="hero">
  <h1>Satellite Globe Visualization</h1>
</div>

<script src="https://unpkg.com/topojson-client@3"></script>

```js
const width = 800;
const height = 800;

const satelliteData = await FileAttachment("satellites.json").json();

// Convert orbital elements to ground track points
function generateGroundTrack({
  inclination, // degrees
  raan, // right ascension of ascending node (Ω)
  argPerigee, // ω
  eccentricity,
  semiMajorAxis, // km
  periodMinutes,
  steps = 500, // number of points along path
}) {
  const mu = 398600.4418; // km^3/s^2
  const earthRotation = 360 / (23.9345 * 3600); // deg/sec

  const i = (inclination * Math.PI) / 180;
  const Ω = (raan * Math.PI) / 180;
  const ω = (argPerigee * Math.PI) / 180;

  // Convert period to seconds
  const T = periodMinutes * 60;

  // Output array
  const track = [];

  for (let k = 0; k < steps; k++) {
    const t = (k / steps) * T;

    // Mean anomaly
    const M = 2 * Math.PI * (t / T);

    // Eccentric anomaly via simple iteration
    let E = M;
    for (let j = 0; j < 5; j++) {
      E = M + eccentricity * Math.sin(E);
    }

    // True anomaly
    const ν =
      2 *
      Math.atan2(
        Math.sqrt(1 + eccentricity) * Math.sin(E / 2),
        Math.sqrt(1 - eccentricity) * Math.cos(E / 2)
      );

    // Distance from Earth center (km)
    const r = semiMajorAxis * (1 - eccentricity * Math.cos(E));

    // Perifocal coordinates
    const x_p = r * Math.cos(ν);
    const y_p = r * Math.sin(ν);
    const z_p = 0;

    // Rotation matrix to ECI frame
    const cosΩ = Math.cos(Ω),
      sinΩ = Math.sin(Ω);
    const cosω = Math.cos(ω),
      sinω = Math.sin(ω);
    const cosi = Math.cos(i),
      sini = Math.sin(i);

    const x =
      x_p * (cosΩ * cosω - sinΩ * sinω * cosi) -
      y_p * (cosΩ * sinω + sinΩ * cosω * cosi);
    const y =
      x_p * (sinΩ * cosω + cosΩ * sinω * cosi) -
      y_p * (sinΩ * sinω - cosΩ * cosω * cosi);
    const z = x_p * (sinω * sini) + y_p * (cosω * sini);

    // Convert ECI → rotating Earth (subtract Earth rotation)
    const theta = (earthRotation * t * Math.PI) / 180; // radians
    const x_e = x * Math.cos(theta) + y * Math.sin(theta);
    const y_e = -x * Math.sin(theta) + y * Math.cos(theta);
    const z_e = z;

    // Convert to lat/lon
    const lon = (Math.atan2(y_e, x_e) * 180) / Math.PI;
    const lat =
      (Math.atan2(z_e, Math.sqrt(x_e * x_e + y_e * y_e)) * 180) / Math.PI;

    track.push([lon, lat]);
  }

  return track;
}

const projection = d3
  .geoOrthographic()
  .scale(350) // Controls the globe size
  .translate([width / 2, height / 2])
  .rotate([0, -90]) // Center on the North Pole
  .clipAngle(90); // Show only one hemisphere

const path = d3.geoPath().projection(projection);

const svg = d3
  .select("body")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

// Draw the globe outline (ocean)
svg
  .append("path")
  .datum({ type: "Sphere" })
  .attr("d", path)
  .attr("fill", "#cce5ff")
  .attr("stroke", "#000");

// Load and draw countries
d3.json("https://unpkg.com/world-atlas@2/countries-110m.json").then(
  (worldData) => {
    const countries = topojson.feature(worldData, worldData.objects.countries);

    svg
      .selectAll(".country")
      .data(countries.features)
      .enter()
      .append("path")
      .attr("class", "country")
      .attr("d", path)
      .attr("fill", "#d9d9d9")
      .attr("stroke", "#333")
      .attr("stroke-width", 0.5);

    // Optionally add graticule (lat/long lines)
    const graticule = d3.geoGraticule();
    svg
      .append("path")
      .datum(graticule())
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "#888")
      .attr("stroke-opacity", 0.3);

    // Filter satellites with valid orbital parameters
    const validSats = satelliteData.filter(
      (sat) =>
        sat["Perigee (km)"] &&
        sat["Apogee (km)"] &&
        sat["Inclination (degrees)"] &&
        sat["Period (minutes)"]
    );

    // Take only 3 satellites
    const threeSats = validSats.slice(0, 150);

    threeSats.forEach((sat) => {
      const Re = 6371; // Earth radius in km
      const rp = Re + sat["Perigee (km)"];
      const ra = Re + sat["Apogee (km)"];
      const a = (rp + ra) / 2;

      const track = generateGroundTrack({
        inclination: sat["Inclination (degrees)"],
        raan: 0, // placeholder
        argPerigee: 0, // placeholder
        eccentricity: sat["Eccentricity"],
        semiMajorAxis: a,
        periodMinutes: sat["Period (minutes)"],
        steps: 500,
      });

      const orbitGeoJSON = {
        type: "LineString",
        coordinates: track,
      };

      svg
        .append("path")
        .datum({ orbit: orbitGeoJSON, sat })
        .attr("d", path(orbitGeoJSON))
        .attr("stroke", "red")
        .attr("stroke-width", 1)
        .attr("fill", "none")
        .attr("opacity", 0.6)
        .on("mouseover", function (event, d) {
          tooltip.style("opacity", 1).html(`
        <b>${d.sat["Current Official Name of Satellite"] || "Unnamed"}</b><br>
        <b>Country:</b> ${d.sat["Country of Operator/Owner"]}<br>
        <b>Purpose:</b> ${d.sat["Purpose"]}<br>
        <b>Launch Date:</b> ${new Date(
          d.sat["Date of Launch"]
        ).toLocaleDateString()}<br>
        <b>Inclination:</b> ${d.sat["Inclination (degrees)"]}°<br>
        <b>Altitude:</b> ${d.sat["Perigee (km)"]}–${d.sat["Apogee (km)"]} km
      `);

          d3.select(this)
            .attr("stroke-width", 3)
            .attr("opacity", 1)
            .attr("stroke", "yellow"); // highlight on hover
        })
        .on("mousemove", function (event) {
          tooltip
            .style("left", event.pageX + 15 + "px")
            .style("top", event.pageY + 15 + "px");
        })
        .on("mouseout", function () {
          tooltip.style("opacity", 0);
          d3.select(this)
            .attr("stroke-width", 1)
            .attr("opacity", 0.6)
            .attr("stroke", "red"); // restore style
        });
    });

    // Example satellite path (just a great circle arc)
    // const satellitePath = {
    //   type: "LineString",
    //   coordinates: [
    //     [0, 0], // longitude, latitude
    //     [90, 45],
    //     [180, 0],
    //   ],
    // };

    // svg
    //   .append("path")
    //   .datum(satellitePath)
    //   .attr("d", path)
    //   .attr("stroke", "red")
    //   .attr("fill", "none")
    //   .attr("stroke-width", 2);

    let rotationAngle = 0;
    let spinning = false;
    let timer = null;

    // let timer = d3.timer((elapsed) => {
    //   rotationAngle = elapsed * 0.02; // degrees
    //   projection.rotate([rotationAngle, -90]);
    //   svg.selectAll("path").attr("d", path);
    // });

    svg.on("click", () => {
      if (spinning) {
        timer.stop();
        spinning = false;
      } else {
        const startAngle = rotationAngle;
        timer = d3.timer((elapsed) => {
          projection.rotate([startAngle + elapsed * 0.02, -90]);
          svg.selectAll("path").attr("d", path);
          rotationAngle = startAngle + elapsed * 0.02; // keep track for next toggle
        });
        spinning = true;
      }
    });
  }
);
// Create tooltip
const tooltip = d3
  .select("body")
  .append("div")
  .style("position", "absolute")
  .style("padding", "8px")
  .style("background", "rgba(0,0,0,0.8)")
  .style("color", "white")
  .style("border-radius", "5px")
  .style("pointer-events", "none")
  .style("font-size", "14px")
  .style("opacity", 0);

display(svg.node());
```
