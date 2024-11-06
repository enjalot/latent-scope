export function processHulls(labels, points, indexMap) {
    if (!labels) return []
    return labels.map(d => {
        return d.hull.map(i => points[indexMap[i]])
    })
}

// let's warn mobile users (on demo in read-only) that desktop is better experience
export const isMobileDevice = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};
