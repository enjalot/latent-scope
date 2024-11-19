export const mapSelectionDomain = [0, 1, 2, 3, 99];
export const mapSelectionKey = {
  hidden: 99,
  normal: 0,
  selected: 1,
  notSelected: 2,
  hovered: 3,
};
// export const mapSelectionColorsLight = [
//   "#61409b", // 0, normal
//   "#3f007d", // 1, selected
//   "#b6b5d8", // 2, not selected
//   "#fcfbfd", // 99, hidden
// ]
export const mapSelectionColorsLight = [
  '#b87333', // 0, normal
  '#945e2b', // 1, selected
  '#945e2b', // 2, selected. opacity is lower
  '#945e2b', // 3, hovered
  '#fcfbfd', // 99, hidden
];
export const mapSelectionOpacity = [
  0.75, // normal
  0.85, // selected
  0.1, // not selected
  1, // hovered
  0, // hidden
];
export const mapPointSizeRange = [
  4, // normal
  6, // selected
  3, // not selected
  10, // hovered
  0, // hidden
];
