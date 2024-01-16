import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

import './SlideBar.css';

SlideBar.propTypes = {
  dataset: PropTypes.array.isRequired,
  selected: PropTypes.object,
  onHover: PropTypes.func,
  onClick: PropTypes.func,
};
function SlideBar({ dataset, selected, onHover, onClick }) {

  const [slides, setSlides] = useState([]);
  useEffect(() => {
    if(dataset?.id)
      fetch(`http://localhost:5001/slides?dataset=${dataset.id}`)
        .then(response => response.json())
        .then(data => {
          console.log("SLIDES", data)
          setSlides(data)
        }).catch(e => console.log(e));
  }, [dataset])

  return (
    <div className="slide-bar">
      <div className="slide-bar-header">
        {slides.length} Slides
      </div>
      <div className="slide-bar-body">
        {slides.map((slide, index) => {
          return (
            <div 
              key={index}
              className={slide === selected ? "slide-active slide-bar-item" : "slide-bar-item"}
              onMouseEnter={() => onHover ? onHover(slide) : null}
              onMouseLeave={() => onHover ? onHover(null) : null}
              onClick={() => onClick ? onClick(slide) : null}
            >
              {slide.label}
            </div>
          )
        })}
      </div>
    </div>
  );
}

export default SlideBar;
