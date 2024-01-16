import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';

import './DatasetDetail.css';
import DataTable from './DataTable';
import Scatter from './Scatter';
import AnnotationPlot from './AnnotationPlot';

import { instantiate } from '../lib/DuckDB'


// TODO: decide how to deal with sizing
const scopeWidth = 640
const scopeHeight = 640


function DatasetDetail() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId } = useParams();

  // the indices returned from similarity search
  const [searchIndices, setSearchIndices] = useState([]);
  // indices of items selected by the scatter plot
  const [selectedIndices, setSelectedIndices] = useState([]);
  // indices of items in a chosen slide
  const [slideIndices, setSlideIndices] = useState([]);
  // index of item being hovered over
  const [hoveredIndex, setHoveredIndex] = useState(null);

  useEffect(() => {
    fetch(`http://localhost:5001/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(data => {
        console.log("dataset meta", data)
        setDataset(data)
      });
  }, [datasetId]);

  const [tagset, setTagset] = useState({});
  useEffect(() => {
    fetch(`http://localhost:5001/tags?dataset=${datasetId}`)
      .then(response => response.json())
      .then(data => setTagset(data));
  }, [datasetId])
  const tags = useMemo(() => {
    const tags = []
    for (const tag in tagset) {
      tags.push(tag)
    }
    // console.log("tagset", tagset, tags)
    return tags
  }, [tagset])

  const [tag, setTag] = useState(tags[0]);
  const [tagrows, setTagrows] = useState([]);
  useEffect(() => {
    if(tagset[tag]) {
      fetch(`http://localhost:5001/tags/rows?dataset=${datasetId}&tag=${tag}`)
        .then(response => response.json())
        .then(data => {
          const text_column = dataset.text_column
          let rows = data.map((row, index) => {
            return {
              index: tagset[tag][index],
              text: row[text_column],
              score: row.score, // TODO: this is custom to one dataset
              date: row.date,
            }
          })
          rows.sort((a, b) => b.score - a.score)
          setTagrows(rows)
        }).catch(e => console.log(e));
      } else {
        setTagrows([])
      }
  }, [datasetId, tag, tagset])

  const [distances, setDistances] = useState([]);
  // const [indices, setIndices] = useState([]);
  const searchQuery = (query) => {
    fetch(`http://localhost:5001/nn?dataset=${datasetId}&query=${query}`)
      .then(response => response.json())
      .then(data => {
        // console.log("search", data)
        setDistances(data.distances);
        setSearchIndices(data.indices);
        scatter?.zoomToPoints(data.indices, { transition: true, padding: 0.2, transitionDuration: 1500 })
      });
  };

  const hydrateIndices = useCallback((indices, setter, distances = []) => {
    fetch(`http://localhost:5001/indexed?dataset=${datasetId}&indices=${JSON.stringify(indices)}`)
      .then(response => response.json())
      .then(data => {
        if(!dataset) return;
        // console.log("neighbors", data)
        const text_column = dataset.text_column
        let rows = data.map((row, index) => {
          return {
            index: indices[index],
            text: row[text_column],
            score: row.score, // TODO: this is custom to one dataset
            distance: distances[index],
            date: row.date,
          }
        })
        rows.sort((a, b) => b.score - a.score)
        setter(rows)
        // console.log("rows", rows)
      })
  }, [dataset, datasetId])

  const [neighbors, setNeighbors] = useState([]);
  useEffect(() => {
    hydrateIndices(searchIndices, setNeighbors, distances)
  }, [searchIndices, setNeighbors, distances])

  const [selected, setSelected] = useState([]);
  useEffect(() => {
    hydrateIndices(selectedIndices, setSelected)
  }, [selectedIndices, setSelected])
  useEffect(() => {
    if(selected.length === 1){
      searchQuery(selected[0].text)
    }
  }, [selected])

  const [hovered, setHovered] = useState([]);
  useEffect(() => {
    if(hoveredIndex !== null && hoveredIndex !== undefined) {
      hydrateIndices([hoveredIndex], setHovered)
    } else {
      setHovered([])
    }
  }, [hoveredIndex, setHovered])

  const [points, setPoints] = useState([]);
  const [loadingPoints, setLoadingPoints] = useState(false);
  useEffect(() => {
    if(dataset?.active_umap) {
      fetch(`http://localhost:5001/files/${dataset.id}/umaps/${dataset.active_umap}.parquet`)
        .then(response => response.arrayBuffer())
        .then(async buffer => {
          setLoadingPoints(true)
          const db = await instantiate()
          const uint8 = new Uint8Array(buffer)
          const name = dataset.active_umap
          await db.registerFileBuffer(name, uint8);
          const conn = await db.connect();
          await conn.query(
            `CREATE VIEW '${name}' AS SELECT * FROM parquet_scan('${name}')`
          );
          const results = await conn.query(`SELECT * FROM '${name}'`);
          // await conn.close();
          // let rows = results.toArray().map(Object.fromEntries);
          // rows.columns = results.schema.fields.map((d) => d.name);
          let rows = results.toArray().map(d => [d.x, d.y])
          setPoints(rows);
          setLoadingPoints(false)
        })
        .catch(err => console.log(err))
    }
  }, [dataset]);

  

  const [xDomain, setXDomain] = useState([-1, 1]);
  const [yDomain, setYDomain] = useState([-1, 1]);
  const handleView = useCallback((xDomain, yDomain) => {
    setXDomain(xDomain);
    setYDomain(yDomain);
  })
  
  const handleSelected = useCallback((indices) => {
    setSelectedIndices(indices);
    setActiveTab(0)
    // scatter?.zoomToPoints(indices, { transition: true })
  })
  const handleHover = useCallback((index) => {
    setHoveredIndex(index);
  })
  const handleClicked = useCallback((index) => {
    scatter?.zoomToPoints([index], { transition: true, padding: 0.9, transitionDuration: 1500 })
  })

  const [searchAnnotations, setSearchAnnotations] = useState([]);
  useEffect(() => {
    const annots = searchIndices.map(index => points[index])
    setSearchAnnotations(annots)
  }, [searchIndices, points])

  const [tagAnnotations, setTagAnnotations] = useState([]);
  useEffect(() => {
    if(tagset[tag]) {
      const annots = tagset[tag].map(index => points[index])
      setTagAnnotations(annots)
    } else {
      setTagAnnotations([])
      if(scatter && scatter.zoomToOrigin)
        scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 })
    }
  }, [tagset, tag, points])


  const [hoverAnnotations, setHoverAnnotations] = useState([]);
  useEffect(() => {
    if(hoveredIndex !== null && hoveredIndex !== undefined) {
      setHoverAnnotations([points[hoveredIndex]])
    } else {
      setHoverAnnotations([])
    }
  }, [hoveredIndex, points])


  // this is a reference to the regl scatterplot instance
  // so we can do stuff like clear selections without re-rendering
  const [scatter, setScatter] = useState({})

  const tabs = [
    { id: 0, name: "Selected"},
    { id: 1, name: "Search"},
    { id: 2, name: "Slide"},
    { id: 3, name: "Tag"},
  ]
  const [activeTab, setActiveTab] = useState(0)

  if (!dataset) return <div>Loading...</div>;

  return (
    <div className="dataset--details">
      <h2>Dataset: {datasetId}</h2>
      <div className="dataset--details-summary">

        [ {dataset.shape[0]} rows ][ {dataset.model} ][ {dataset.active_umap} ]
        [ <a href={`/datasets/${datasetId}/experiments`}>umap experiments</a> ]
        <br/>

        Tags: {tags.map(t => {
          const href = `/datasets/${datasetId}/tags/${t}`
          return <button className="dataset--tag-link" key={t} onClick={() => {
            setTag(t)
            setActiveTab(3)
            scatter?.zoomToPoints(tagset[t], { transition: true, padding: 0.2, transitionDuration: 1500 })
          }}>{t}({tagset[t].length})</button>
        })}
        {/* NEW TAG FORM */}
        <form className="new-tag" onSubmit={(e) => {
          e.preventDefault();
          const newTag = e.target.elements.newTag.value;
          fetch(`http://localhost:5001/tags/new?dataset=${datasetId}&tag=${newTag}`)
            .then(response => response.json())
            .then(data => {
              console.log("new tag", data)
              setTagset(data);
            });
        }}>
          <input type="text" id="newTag" />
          <button type="submit">New Tag</button>
        </form>
        <br/>
      </div>

      <div className="dataset--search-box">
        <form onSubmit={(e) => {
          e.preventDefault();
          searchQuery(e.target.elements.searchBox.value);
          setActiveTab(1)
        }}>
          <input type="text" id="searchBox" />
          <button type="submit">Similarity Search</button>
          
        </form>
      </div>

      <div className="dataset--scope-container">
        <div className="dataset--scope" style={{ width: scopeWidth, height: scopeHeight }}>
          <Scatter 
            points={points} 
            loading={loadingPoints} 
            width={scopeWidth} 
            height={scopeHeight}
            onScatter={setScatter}
            onView={handleView} 
            onSelect={handleSelected}
            onHover={handleHover}
            />
          <AnnotationPlot 
            points={searchAnnotations} 
            fill="black"
            size="3"
            xDomain={xDomain} 
            yDomain={yDomain} 
            width={scopeWidth} 
            height={scopeHeight} 
            />
          <AnnotationPlot 
            points={tagAnnotations} 
            symbol={tag}
            size="10"
            xDomain={xDomain} 
            yDomain={yDomain} 
            width={scopeWidth} 
            height={scopeHeight} 
            />
          <AnnotationPlot 
            points={hoverAnnotations} 
            stroke="black"
            fill="orange"
            size="4"
            xDomain={xDomain} 
            yDomain={yDomain} 
            width={scopeWidth} 
            height={scopeHeight} 
            />
          
        </div>
        <div className="dataset--tabs">
          <div className="dataset--tab-header">
            {tabs.map(tab => (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id)}
                className={tab.id === activeTab ? 'tab-active' : 'tab-inactive'}>
                  {tab.name}
              </button>
            ))}
          </div>

          <div className="dataset--tab-content">
            {activeTab === 0 ?
            <div className="dataset--selected-table">
              <span>Selected: {selected.length} 
                {selected.length > 0 ? 
                  <button className="deselect" onClick={() => {
                    setSelectedIndices([])
                    scatter?.select([])
                    scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 })
                  }
                  }>X</button> 
                : null}
              </span>
              {selected.length > 0 ? 
                <DataTable 
                  data={selected} 
                  tagset={tagset} 
                  datasetId={datasetId} 
                  maxRows={150} 
                  onTagset={(data) => setTagset(data)} 
                  onHover={handleHover} 
                  onClick={handleClicked}
                  />
              : null }
            </div>
            : null }

            {activeTab === 1 ? 
            <div className="dataset--neighbors">
              <span>Nearest Neighbors: {searchIndices.length}
                {searchIndices.length > 0 ? 
                  <button className="deselect" onClick={() => {
                    setSearchIndices([])
                    document.getElementById("searchBox").value = "";
                  }
                  }>X</button> 
                : null}
              </span>
              {neighbors.length > 0 ?
                <DataTable 
                  data={neighbors} 
                  tagset={tagset} 
                  datasetId={datasetId} 
                  onTagset={(data) => setTagset(data)} 
                  onHover={handleHover} 
                  onClick={handleClicked}
                />
              : null }
            </div>
            : null }

            {activeTab === 2 ? 
             <div className="dataset--slide">
              Slide!
              </div>
            : null }

            {activeTab === 3 ? 
              <div className="dataset--slide">
              <span>{tag} {tagset[tag]?.length}
                { tag ? <button className="deselect" onClick={() => {
                    setTag(null)
                  }
                  }>X</button> 
                : null}
              </span>
              { tagrows.length ? 
                <DataTable 
                  data={tagrows} 
                  tagset={tagset} 
                  datasetId={datasetId} 
                  onTagset={(data) => setTagset(data)} 
                  onHover={handleHover} 
                  onClick={handleClicked}
                />
              : null }
              </div>
            : null }
            
          </div>
        </div>
      </div>

      <div className="dataset--hovered-table">
        {/* Hovered: &nbsp; */}
        <span>{hovered[0]?.text}</span>
        {/* <DataTable  data={hovered} tagset={tagset} datasetId={datasetId} onTagset={(data) => setTagset(data)} /> */}
      </div>
    </div>
  );
}

export default DatasetDetail;
