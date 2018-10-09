import SVG from 'svg.js'
import { extendHex, defineGrid } from 'honeycomb-grid'
import Tile from './tile.js'
import Cable from './cable.js'

const DEBUG_LOG = false

export default class Grid {
  constructor (element, store) {
    this.draw = SVG(element)
    this.hexSize = 20
    this.store = store

    this.watch()
  }

  debugLog() {
    if (DEBUG_LOG) {
      console.log.apply(console, arguments)
    }
  }

  watch () {
    this.store.watch((state) => {
      return state.map ? `${state.map.id}_${state.activeLayoutId}` : null
    }, () => {
      var layout = this.store.getters.activeLayout;
      if (layout) {
        this.drawGrid(layout.height, layout.width, layout.grid)
      }
    });

    this.store.watch((state, getters) => {
      if (!getters.activeLayout) { return null }
      return `${getters.activeLayout.width}x${getters.activeLayout.height}`
    }, this.redraw.bind(this))
  }

  drawGrid (tiles) {
    if(this.grid) return

    this.tiles = tiles;

    this.hexFactory = extendHex({ size: this.hexSize })
    this.gridFactory = defineGrid(this.hexFactory)
    this.addRow = this.draw.group()
      .click(this.store.commit.bind(this.store, 'addRow'))
    this.addColumn = this.draw.group()
      .click(this.store.commit.bind(this.store, 'addColumn'))

    this.grid = this.gridFactory.rectangle({
      width: this.store.getters.activeLayout.width,
      height: this.store.getters.activeLayout.height
    })

    this.grid.forEach((hex, index) => {
      var tile = new Tile(hex, this, this.store);
      hex.set({
        tile: tile,
        x: hex.x,
        y: hex.y
      })
    })

    this.resizeSVG()
    this.drawAddLines()
  }

  drawAddLines () {
    var unitsRight = this.store.getters.activeLayout.width
    var unitsDown = this.store.getters.activeLayout.height
    var topRight = this.grid.get(unitsRight - 1)
    var bottomLeft = this.grid.get(unitsRight * (unitsDown - 1) + 1)
    var xOffset = topRight.toPoint().x + topRight.width()
    var yOffset = bottomLeft.toPoint().y + bottomLeft.corners()[1].y

    var rightGrid = this.gridFactory.rectangle({ width: 1, height: unitsDown })
    var bottomGrid = this.gridFactory.rectangle({ width: unitsRight, height: 1 })


    console.log(bottomLeft.y, bottomLeft.offset, bottomLeft.width())
    this.addRow
      .translate((bottomLeft.y % 2) !== 0 ? 0 : bottomLeft.width() / 2, yOffset)
      .clear()
    this.addColumn
      .translate(xOffset, 0)
      .clear()

    rightGrid.forEach(hex => {
      var points = hex.toPoint()
      this.addColumn.polygon(hex.corners().map(({ x, y }) => `${x},${y}`))
        .stroke({ width: 1, color: '#dcdcdc' })
        .fill('#fff')
        .translate(points.x, points.y)
    })

    bottomGrid.forEach(hex => {
      var points = hex.toPoint()
      this.addRow.polygon(hex.corners().map(({ x, y }) => `${x},${y}`))
        .stroke({ width: 1, color: '#dcdcdc' })
        .fill('#fff')
        .translate(points.x, points.y)
    })
  }

  // Implements a modified Forest-Fire algorithm
  fillFrom(hex) {
    if (!hex.tile.wouldDraw()) { return }
    var target = Object.assign({}, hex.tile.features())
    var queue = [hex]
    hex.set({ toFill: true, x: hex.x, y: hex.y })
    var toFill = [Object.assign({}, hex.tile.drawParams(), { index: hex.tile.index() })]
    var traversalDirections = ['NE','NW','E','W','SE','SW']

    // We will continue appending new edge nodes here until we stop seeing matching tiles
    while(queue.length) {
      var initialHex = queue.shift()

      // Traverse in a straight line in each cardinal direction from the root node
      traversalDirections.forEach(dir => {
        var curHex = initialHex

        // Continue traversing in a line until you stop seeing matching nodes
        while(curHex = this.grid.neighborsOf(curHex, dir)[0]) {
          if (curHex.toFill || !curHex.tile.matches(target)) { return }
          curHex.set({ toFill: true, x: curHex.x, y: curHex.y })
          toFill.push(Object.assign({}, curHex.tile.drawParams(), { index: curHex.tile.index() }))

          // For each node in the line, check its neighbors to see if they match, and add them as new edge nodes
          var neighborsToCheck = traversalDirections.filter(t => { return t !== dir })
          this.grid.neighborsOf(curHex, neighborsToCheck).forEach(n => {

            if (!n.toFill && n.tile.matches(target)) {
              toFill.push(Object.assign({}, n.tile.drawParams(), { index: n.tile.index() }))
              n.set({ toFill: true, x: n.x, y: n.y })
              queue.push(n)
            }
          })
        }

        curHex = initialHex
      })
    }

    toFill.forEach(data => {
      var tile = this.grid.get(data.index)
      tile.set({ toFill: undefined, x: tile.x, y: tile.y })
    })

    this.store.commit('updateTile', toFill)
    Cable.sendTileUpdate(toFill)
  }

  redraw () {
    var width = this.store.getters.activeLayout.width
    var height = this.store.getters.activeLayout.height

    for (var y=0; y < height; y++) {
      for (var x=0; x < width; x++) {
        var index = (y * width) + x

        if (!this.grid.get([x, y])) {
          var hex = this.hexFactory({x, y})
          hex.set({
            x, y,
            tile: new Tile(hex, this, this.store)
          })
          this.grid.splice(index, 0, hex)
        }
      }
    }

    this.drawAddLines()
    this.resizeSVG()
  }

  resizeSVG () {
    var lastHex = this.grid.get(this.grid.length - 1)

    var points = lastHex.toPoint()
    var widthModifier = lastHex.offset === 1 ? 1.5 : 2.5
    var totalWidth = points.x + (lastHex.width() * widthModifier) + 1
    var totalHeight = points.y + (lastHex.height() * 2) + 1
    this.draw.height(totalHeight)
    this.draw.width(totalWidth)
  }
}
