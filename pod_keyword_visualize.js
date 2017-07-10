/*
 * Project Open Data keyword visualizer.
 * This script provides functions for analyzing the keywords in a JSON
 * file compliant with the Project Open Data schema.
 * This version supports schema version 1.1.
*/

// Polyfill the Array find function for older Javascript engines that don't
// include it natively.
// https://tc39.github.io/ecma262/#sec-array.prototype.find
if (!Array.prototype.find) {
  Object.defineProperty(Array.prototype, 'find', {
    value: function(predicate) {
     // 1. Let O be ? ToObject(this value).
      if (this == null) {
        throw new TypeError('"this" is null or not defined');
      }

      var o = Object(this);

      // 2. Let len be ? ToLength(? Get(O, "length")).
      var len = o.length >>> 0;

      // 3. If IsCallable(predicate) is false, throw a TypeError exception.
      if (typeof predicate !== 'function') {
        throw new TypeError('predicate must be a function');
      }

      // 4. If thisArg was supplied, let T be thisArg; else let T be undefined.
      var thisArg = arguments[1];

      // 5. Let k be 0.
      var k = 0;

      // 6. Repeat, while k < len
      while (k < len) {
        // a. Let Pk be ! ToString(k).
        // b. Let kValue be ? Get(O, Pk).
        // c. Let testResult be ToBoolean(? Call(predicate, T, « kValue, k, O »)).
        // d. If testResult is true, return kValue.
        var kValue = o[k];
        if (predicate.call(thisArg, kValue, k, o)) {
          return kValue;
        }
        // e. Increase k by 1.
        k++;
      }

      // 7. Return undefined.
      return undefined;
    }
  });
}

var NUMBER_INITIAL_KEYWORDS = 20;
var PADDING = 50;
var ITERATIONS = 4;
var REPULSION = -150;

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
  var tickNodes = svg.selectAll(".node");
  var tickEdges = svg.selectAll(".edge");
  
  tickEdges.attr("x1", function(d) { return d.source.x; })
           .attr("y1", function(d) { return d.source.y; })
           .attr("x2", function(d) { return d.target.x; })
           .attr("y2", function(d) { return d.target.y; });
    
  tickNodes.attr("cx", function(d) { return d.x; })
           .attr("cy", function(d) { return d.y; });
}
    
// Create a force simulation for positioning the keyword nodes and edges.
// Stop the automatic run of the simulation since there is no data yet.
var forceMap = d3.forceSimulation()
                 .force("collide", d3.forceCollide().iterations(ITERATIONS))
                 .force("link", d3.forceLink()
                                    .id( function(d) { return d.id; }))
                 .force("charge", d3.forceManyBody().strength(REPULSION))
//                 .force("center", d3.forceCenter(width/2, height/2))
                 .force("xPos", d3.forceX())
                 .force("yPos", d3.forceY())
                 .on("tick",ticked);
    
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
        displayEdges.push({ source: displayNodes[i].id, 
                            target: displayNodes[i].connections[j] });
      }
    }
  }
  
  // Set the area scale domain based on the largest number of datasets in the
  // set of keywords to display.              
  areaScale.domain([1,d3.max(displayNodes, function(d) { return d.datasetCount; })]);
  
  // Set the area scale range to ensure the circles can all fit within
  // the width and height of the svg area without overlapping.
  areaScale.range([1,d3.min([(width/displayNodes.length), (height/displayNodes.length)])]);

  // Retrieve the list of nodes, set it to the new data set and adjust any existing radii.  
  node = svg.selectAll(".node")
            .data(displayNodes, function(d) { return d ? d.id : this.id; })
            .attr("r", function (d) { return areaScale(d.datasetCount); });
  // Retrieve the list of edges between nodes, and set it to the new data.
  edge = svg.selectAll(".edge")
            .data(displayEdges);
                 
  // Remove any nodes and edges that should no longer be displayed.              
  node.exit().remove();
  edge.exit().remove();
  
  // Create a circle for each keyword in the filtered subset and set the
  // title to the keyword.
  node.enter().append("circle")
                .classed("node", true)
                .attr("id", function(d) { return d.id; })
                .attr("r", function (d) { return areaScale(d.datasetCount); })
                .merge(node)
                   .call(d3.drag()
                           .on("start",dragStarted)
                           .on("drag",dragged)
                           .on("end",dragEnded))
                   .append("title").text(function(d) { return d.id });
                
                
  // Create lines between the circles for the keyword connections.
  edge.enter().insert("line", ".node").classed("edge", true);

  // Compute the optimal value to use for the link distance, such that all the selected
  // nodes should fit within the display area.
  var dist = (Math.min(width,height) / (displayNodes.length ? displayNodes.length : 1))
    + PADDING;
  
  // Load the nodes and edges into the force map.
  forceMap.nodes(displayNodes);
  
  // Set the collision force to use the updated radius of each node.
  forceMap.force("collide").radius(function(d) { return areaScale(d.datasetCount); });
  
  // Load the edges into the link force, and set it to use the new names and updated
  // distance value.
  forceMap.force("link").links(displayEdges)
                        .distance(dist);
                        
  // Initialize each node to a random position near the center of the graph area.
  forceMap.force("xPos").x(function (d) { return width/2 + Math.random() });
  forceMap.force("yPos").y(function (d) { return height/2 + Math.random() });
  
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
//svg.append("g").attr("class","edges");
//svg.append("g").attr("class","nodes");

document.getElementById("map_button").onclick = mapKeywords;
