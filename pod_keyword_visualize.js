/*
 * Project Open Data keyword visualizer.
 * This script provides functions for analyzing the keywords in a JSON
 * file compliant with the Project Open Data schema.
 * This version supports schema version 1.1.
*/

var NUMBER_INITIAL_KEYWORDS = 20;
var PADDING = 5;
var ITERATIONS = 16;

var keywords = { nodes: [] };
var displayNodes = [];
var displayEdges = [];
var node;
var edge;

var psvg = d3.select("#map"), 
    width = +psvg.attr("width"),
    height = +psvg.attr("height");
    
var svg = d3.select("svg")
            .attr("width",width)
            .attr("height",height); 

// A scaling function to map the keyword dataset count to the
// appropriate area of its representative circle. This ensures the
// visualization follows guidance for bubble charts to set the bubble
// area to the data size, rather than the bubble radius. (Thus, the
// radius should be set by the square root of the desired size value.)
// Doing so makes the visualization more intuitive to the human eye.
var areaScale = d3.scaleSqrt();

// Function for repositioning the edges and nodes based on the simulation, below.
function ticked() {
  edge
    .attr("x1", function(d) { return d.source.x; })
    .attr("y1", function(d) { return d.source.y; })
    .attr("x2", function(d) { return d.target.x; })
    .attr("y2", function(d) { return d.target.y; });
    
  node
    .attr("cx", function(d) { return d.x; })
    .attr("cy", function(d) { return d.y; });
}
    
// Create a force simulation for positioning the keyword nodes and links.
// Stop the automatic run of the simulation since there is no data yet.
var forceMap = d3.forceSimulation()
                 .force("collide", 
                        d3.forceCollide(function(d) {
                          return areaScale(d.datasetCount);
                        }).iterations(ITERATIONS))
                 .force("link", d3.forceLink().id(function (d) { return d.id; }))
                 .force("charge", d3.forceManyBody())
                 .force("center", d3.forceCenter(width/2, height/2))
                 .on("tick",ticked)
                 .stop();
    
function buildSelectionList() {
  // Build a selection list for the aggregated keywords. Remove any
  // options that were in a previous file's keywords list but not in the
  // current one. Select the most popular keywords set to display initially.
  var sl = document.getElementById("keywords");
  
  // Empty the current options list.
  while (sl.length > 0) {
    sl.remove(0);
  }
  
  for (var i = 0; i < keywords.nodes.length; i++) {
    var opt = document.createElement("option");
    
    opt.text = keywords.nodes[i].id;
    opt.value = i;
    opt.selected = keywords.nodes[i].show;
    sl.add(opt);
  }
    
}

function dragStarted(d) {
  if (!d3.event.active) forceMap.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(d) {
  d.fx = d3.event.x;
  d.fy = d3.event.y;
}

function dragEnded(d) {
  if (!d3.event.active) forceMap.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}

function displayForceMap() {

  // Create a subset for all the keywords that are marked to show.
  displayNodes = keywords.nodes.filter( function(d) { return d.show; });
  // Build an array of edges to display only the lines between the displayed keywords.
  displayEdges = [];
  for (var i = 0; i < displayNodes.length; i++) {
    for (var j = 0; j < displayNodes[i].connections.length; j++) {
      var target = displayNodes.find( function (d) { return d.id === displayNodes[i].connections[j]; });
      if (typeof target !== "undefined") {
        displayEdges.push({ source: displayNodes[i].id, target: displayNodes[i].connections[j] });
      }
    }
  }
  
  // Set the area scale domain based on the largest number of datasets in the
  // set of keywords to display.              
  areaScale.domain([1,d3.max(displayNodes, function(d) { return d.datasetCount; })]);
  
  // Set the area scale range to ensure the circles can all fit within
  // the width and height of the svg area without overlapping.
  areaScale.range([1,d3.min([(width/displayNodes.length), (height/displayNodes.length)])]);
  
  node = svg.select(".nodes")
                .selectAll("circle")
                .data(displayNodes, function(d) { return d ? d.id : this.id; });
  
  // Remove any nodes no longer in the map.              
  node.exit().remove();

  // Create a circle for each keyword in the filtered subset.
  node.enter().append("circle")
                .attr("r", function (d) { return areaScale(d.datasetCount); })
                .attr("id", function(d) { return d.id; })
      .merge(node)
      .call(d3.drag()
        .on("start",dragStarted)
        .on("drag",dragged)
        .on("end",dragEnded));

  // Add the keyword name as the title of each circle.
  node.append("title").text(function(d) { return d.id });

  // Create lines between the circles for the keyword connections.
  edge = svg.select(".edges")
                 .selectAll("line")
                 .data(displayEdges);
                 
  edge.exit().remove();
  
  edge.enter().append("line")
    .merge(edge)

  // Load the nodes and edges into the force map.
  forceMap.nodes(displayNodes);
  forceMap.force("link").links(displayEdges);

  // Restart the simulation on the new data.
  forceMap.alpha(1).restart();

}

function setProgress(count, limit) {
  document.getElementById("number_datasets").innerText = "Processed " + count + " of " + limit + " datasets.";
}

// Load completion callback, with error handling.
function aggregateKeywords(error, datasets) {

  if (error) throw error;

  // Aggregate the list of keywords and connections between keywords
  // for mapping in a D3 force layout.
  // A keyword is connected to another keyword if they are both
  // associated with a given dataset.

  // Initialize the keywords object array to be empty,
  // discarding any previous content.
  keywords.nodes.length = 0; 

  // Loop over the dataset array, if it exists as a field at the second
  // level of the loaded object..
  if (typeof datasets.dataset === "undefined") {
    alert("The file at the specified URL did not contain a dataset element.");
    return;
  }
  if (!datasets.dataset instanceof Array) { 
    alert("The file at the specified URL did not contain a dataset array.");
    return;
  }

  var ds = datasets.dataset;
  
  // Initialize the progress label.
  setProgress(0, ds.length);
   
  // Loop over all the dataset entries.
  for (var i = 0; i < ds.length; i++) {
    setProgress(i, ds.length);
    // Aggregate keywords only if they're defined for the current
    // dataset.
    if (ds[i].keyword instanceof Array) {
      var ks = ds[i].keyword;
      // Sort the keywords alphabetically ascending. This ensures the keyword connections
      // are always in ascending keyword order.
      ks.sort();
      // Loop over all the keywords for the current dataset.
      for (var j = 0; j < ks.length; j++) {
        // If the current keyword isn't already in the aggregate
        // keywords list, add it with a dataset count of 1 and
        // set not to display.
        var kw = keywords.nodes.find( function(d) { return d.id === ks[j] });
        if (typeof kw === "undefined") {
          kw = { id:ks[j], datasetCount:1, show:false, connections:[] };
          keywords.nodes.push(kw);
        } else {
          // Increment the dataset count for the found keyword.
          kw.datasetCount++;
        }
        // Loop over the remaining keywords and record connections to the current keyword.
        for (var k = j+1; k < ks.length; k++) {
          if (kw.connections.indexOf(ks[k]) === -1) {
            kw.connections.push(ks[k]);
          }
        }
      }
    }
  }
  
  setProgress(ds.length, ds.length);
  
  // Sort the completed list of keywords by descending dataset count.
  keywords.nodes.sort(function (a,b) { return (b.datasetCount -
                                               a.datasetCount) });

  // Set the most popular keywords to initially be displayed.
  for (i = 0; i < Math.min(NUMBER_INITIAL_KEYWORDS,keywords.nodes.length); i++) {
    keywords.nodes[i].show = true;
  }

  buildSelectionList();

  displayForceMap();

}

// Callback for loading a new JSON data file, and rebuilding the
// visualization as a result.
function mapKeywords() {

  var url = document.getElementById("pod_url").value;

  d3.json(url, aggregateKeywords);

}

// Callback function to toggle showing a keyword based on the selection
// list.
function toggleKeyword(i) {
  // Scan the selection list and set the corresponding node show values
  // based on whether the corresponding option is selected.
  var sl = document.getElementById("keywords");
  for (var i = 0; i < sl.length; i++) {
    keywords.nodes[i].show = sl.options[i].selected;
  }
  
  
  // Redraw the force map with the new selection.
  displayForceMap();
}

//Initialize DOM elements within the SVG element for the nodes and edges.
svg.append("g").attr("class","edges");
svg.append("g").attr("class","nodes");

document.getElementById("map_button").onclick = mapKeywords;
