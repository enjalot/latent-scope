import {html} from "../../_npm/htl@0.3.1/_esm.js";
import * as Inputs from "../../_observablehq/stdlib/inputs.js";
import * as Plot from "../../_npm/@observablehq/plot@0.6.14/_esm.js";

export function clusterCard(cluster, description, da, scope) {
  const cda = da.filter(d => d.cluster == cluster)
  return html`<div class="grid grid-cols-1">
  <div class="card">
    <h2>Cluster ${cluster}: ${scope.cluster_labels_lookup[cluster].label}</h2>
    <h3>${cda.length} rows</h3>
    <div class="cluster-content">
      <div class="cluster-plot">
      ${
        Plot.plot({
        marks: [
          Plot.dot(da, {
            x: "x",
            y: "y",
            fill: "lightgray",
          }),
          Plot.dot(da, {
            filter: d => d.cluster == cluster,
            x: "x",
            y: "y",
            fill: "cluster",
          })
        ],
        width: 300,
        height: 300,
        color: { scheme: "cool" },
        y: { axis: null},
        x: { axis: null }
      })
      }
      </div>
      <div class="cluster-description">
      ${description}
      </div>
    </div>
    <div class="static-table">
      ${Inputs.table(cda, { 
            columns: [
              "DataVizNotUnderstood",
              "Role",
              "YearsDataVizExperience",
            ],
            width: {
              "DataVizNotUnderstood": "60%",
              "YearsDataVizExperience": "100px"
            },
            rows: 12
          })}
    </div>
</div>`
}

