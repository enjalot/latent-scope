// https://gist.github.com/callumlocke/cc258a193839691f60dd
/**
 * This function takes a canvas, context, width and height. It scales both the
 * canvas and the context in such a way that everything you draw will be as
 * sharp as possible for the device.
 *
 * It doesn't return anything, it just modifies whatever canvas and context you
 * pass in.
 *
 * Adapted from Paul Lewis's code here:
 * http://www.html5rocks.com/en/tutorials/canvas/hidpi/
 */

export default function scaleCanvas(canvas, context, width, height) {
  // assume the device pixel ratio is 1 if the browser doesn't specify it
  const devicePixelRatio = window.devicePixelRatio || 1;

  // determine the 'backing store ratio' of the canvas context
  const backingStoreRatio =
    context.webkitBackingStorePixelRatio ||
    context.mozBackingStorePixelRatio ||
    context.msBackingStorePixelRatio ||
    context.oBackingStorePixelRatio ||
    context.backingStorePixelRatio ||
    1;

  // determine the actual ratio we want to draw at
  const ratio = devicePixelRatio / backingStoreRatio;

  if (devicePixelRatio !== backingStoreRatio) {
    // set the 'real' canvas size to the higher width/height
    canvas.width = width * ratio;
    canvas.height = height * ratio;

    // ...then scale it back down with CSS
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
  } else {
    // this is a normal 1:1 device; just scale it simply
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = '';
    canvas.style.height = '';
  }

  // scale the drawing context so everything will work at the higher ratio
  context.scale(ratio, ratio);
  context.imageSmoothingEnabled = false;
}
