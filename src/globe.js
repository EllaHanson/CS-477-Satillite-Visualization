import * as d3 from "npm:d3"
import * as topojson from "npm:topojson-client"
import { FileAttachment } from "observablehq:stdlib";

export async function createSatelliteGlobe({
  container,
  width = 960,
  height = 960
}) {

  // const projection = d3.geoEquirectangular();
  //const projection = d3.geoNaturalEarth1();
  // const projection = d3.geoEqualEarth();
  // const projection = d3.geoMercator();
  const projection = d3.geoOrthographic().clipAngle(90)
  projection.fitSize([width, height], { type: "Sphere" })

  const path = d3.geoPath(projection)

  const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
  const countries = topojson.feature(world, world.objects.countries)
  const country_borders = topojson.mesh(world, world.objects.countries, (a,b) => a !== b)

  const countryCenter = countries.features.map(d => {
    const [lon, lat] = d3.geoCentroid(d)
    return { name: d.properties.name, lon, lat }
  })

  /* data wrangling */
  const input_file = await FileAttachment("data/info.tsv").text()
  const satellites = d3.tsvParse(input_file)

  const coord_text = await FileAttachment("data/coords.tsv").text()
  const launch_sites = d3.tsvParse(coord_text)
  const coord_map = new Map(
    launch_sites.map(i => [i.Site.trim(), [+i.Longitude, +i.Latitude]])
  )

  function getOwnerCountry(line) {
    const temp = line["Country of Operator/Owner"]
    if (temp) {
      return temp.trim()
    }
    return "Unknown"
  }

  /* launch data */
  const data = []
  for (const i of satellites) {
    /* site name */
    const site = i["Launch Site"] && i["Launch Site"].trim()
    if (!site) continue
    const coord = coord_map.get(site)
    if (!coord) continue
    /* add site name, coords, and owner country to launch data */
    data.push({ ...i, coord, owner_country: getOwnerCountry(i) })
  }

  function coord_to_country(lon, lat) {
    let found = null
    for (const x of countries.features) {
      if (d3.geoContains(x, [lon, lat])) {
        found = x.properties.name
        break
      }
    }
    return found
  }

  for (const x of data) {
    if (!x.coord) continue
    const country = coord_to_country(x.coord[0], x.coord[1])
    if (country) {
      x.launch_country = country
    }
  }

  const svg = d3.create("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "100%")

  svg.append("path")
    .datum({ type: "Sphere" })
    .attr("fill", "#555")
    .attr("stroke", "#111")
    .attr("stroke-width", 0.5)
    .attr("d", path)

  /* all the individual countries */
  svg.append("g")
    .selectAll("path")
    .data(countries.features)
    .join("path")
    .attr("class", "country")
    .attr("fill", "#ccc")
    .attr("stroke", "#111")
    .attr("stroke-width", 0.5)
    .attr("d", path)

  container.appendChild(svg.node())

  /* transition logic */

  /* transition */
  function flyTo({lon, lat, scale}) {
    /* current settings */
    const startCenter = projection.rotate()
    const startScale = projection.scale()

    /* smooth transitions */
    const trans_center = d3.interpolateArray(startCenter, [-lon, -lat, 0])
    const trans_scale = d3.interpolateNumber(startScale, scale ?? startScale)
    const time = 1500

    d3.select(svg.node())
      .transition()
      .duration(time)
      .ease(d3.easeCubicInOut)
      .tween("projection", () => t => {
        projection.rotate(trans_center(t))
        projection.scale(trans_scale(t))
        svg.selectAll("path").attr("d", path)
        launches.selectAll("circle")
          .attr("transform", d => {
            const [x, y] = projection(d.coord)
            return `translate(${x}, ${y})`
          })
      })
  }

  const defaultFill = "#ccc"
  const highlightFill = "#60a5fa"

  /* blue shading for viewing country */
  function highlightCountry(country_name) {
    svg.selectAll(".country")
      .transition()
      .duration(2000)
      .ease(d3.easeCubicOut)
      .attr("fill", i => {
        if (!country_name) return defaultFill
        if (i.properties.name === country_name) return highlightFill
        return defaultFill
      })
  }

  const sat_stroke = "#b71aa5ff"
  const sat_stroke_width = 3

  /* boarder around countries that satillites are being displayed for */
  /* can be connected to satillite projections */
  function highlightSatelliteCountry(country_name) {
    svg.selectAll(".country")
      .transition()
      .duration(1000)
      .ease(d3.easeCubicOut)
      .attr("stroke", i => {
        if (i.properties.name === country_name) return sat_stroke
        else return "#111"
      })
      .attr("stroke-width", i => {
        if (i.properties.name === country_name) return sat_stroke_width
        else return 0.5
      })
  }

  /* launch site dots */
  const launches = svg.append("g").attr("class", "launch-site")

  function drawLaunchSites(country_name) {
    /* grabbing launch-site instances */
    launches.selectAll("*").remove()
    /* if country name not found then just return */
    if (!country_name) return

    /* get only launch sites in selected country */
    const relevant = data.filter(i => i.launch_country === country_name)

    /* group by launch site and find count (length) of launches */
    const site_info = d3.rollups(
      relevant,
      v => v.length,
      i => i["Launch Site"]?.trim()
    )

    const launch_point = site_info.map(([site, count]) => {
      /* get any instance of coordinates for the launch site */
      const find_coord = relevant.find(r => r["Launch Site"]?.trim() === site && r.coord)

      if (find_coord) {
        return { site, count, coord: find_coord.coord }
      }
      else {
        return null
      }
    }).filter(Boolean)

    if (!launch_point.length) {
      return
    }

    const rad = d3.scaleSqrt()
      .domain([1, d3.max(launch_point, d => d.count)])
      .range([2,10])

    launches.selectAll("circle")
      /* set key to site name */
      .data(launch_point, d => d.site)
      .join("circle")
      .attr("transform", d => {
        const [x, y] = projection(d.coord)
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

  // this file is only about map stuff, so we just return map controls
  return {
    svg,
    projection,
    countries,
    data,
    countryCenter,
    flyTo,
    highlightCountry,
    highlightSatelliteCountry,
    drawLaunchSites
  }
}