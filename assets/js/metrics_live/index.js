import { ColorWheel, LineColor } from './color_wheel'
import _css from 'uplot/dist/uPlot.min.css'
/** We are importing uPlot locally until the new API is released */
import uPlot from 'uplot'

/** Chart.js Storage Adapters **/

export const DataFns = {
  increment(labelIndex, { y: measurement }) {
    this.data.datasets[0].data[labelIndex] += measurement
  },
  indexOf(label) {
    return this.data.labels.indexOf(label)
  },
  pushDataset(label, { y: measurement }) {
    const labelIndex = this.data.labels.push(label)
    this.data.datasets[0].data.push(measurement)
    this.data.datasets[0].backgroundColor.push(
      ColorWheel.at(this.data.labels.length)
    )
    return labelIndex - 1
  },
  pushData(labelIndex, { y: measurement }) {
    this.data.datasets[0].data[labelIndex] = measurement
  }
}

const DatasetFns = {
  increment(labelIndex, { z }) {
    let { y } = this.data.datasets[labelIndex].data[this.data.datasets[labelIndex].length - 1]
    DatasetFns.pushData.call(this, labelIndex, { y: y++, z })
  },
  indexOf(label) {
    return this.data.datasets.findIndex(d => d.label === label)
  },
  pushDataset(label, { y, z: t }) {
    const color = ColorWheel.at(this.data.datasets.length)
    return this.data.datasets.push({
      label: label,
      data: [{ t, y }],
      backgroundColor: color,
      borderColor: color,
      fill: false
    })
  },
  pushData(labelIndex, { y, z: t }) {
    this.data.datasets[labelIndex].data.push({ t, y })
  }
}

const Values = ({ unit }) => {
  return {
    values: (u, vals, space) => vals.map(v => +v.toFixed(2) + ` ${unit}`),
  }
}

/** Chart.js Configs **/

const DoughnutConfig = (options) => {
  return {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [{
        backgroundColor: [],
        data: [],
        label: options.title
      }]
    },
    options: {
      responsive: true,
      title: {
        display: true,
        text: options.title
      },
      animation: {
        animateScale: true,
        animateRotate: true
      },
      circumference: Math.PI,
      rotation: -Math.PI,
      legend: {
        position: 'bottom',
        align: 'start'
      }
    }
  }
}

const TimeseriesConfig = (options) => {
  return {
    title: options.title,
    width: options.width, // configured?
    height: options.height, // configured?
    series: [
      {}
    ],
    scales: {
      x: {
        min: options.now - 60,
        max: options.now,
      },
      y: {
        min: 0,
        max: 1,
      },
    },
    axes: [
      {
        // Default for X
        grid: {
          show: true,
          stroke: "#eee",
          width: 1,
          dash: [],
        }
      },
      {
        scale: options.unit,
        show: true,
        grid: {
          show: true,
          stroke: "#eee",
          width: 1,
          dash: [],
        },
        size: 70,
        space: 15,
        ...Values(options)
      }
    ]
  }
}

/** Chart.js Instrument **/

const __INSTRUMENTS__ = {
  doughnut: { config: DoughnutConfig, storage: DataFns },
  timeseries: { config: TimeseriesConfig, storage: DatasetFns }
}

class Instrument {
  static create({ instrument, ...options }) {
    return new Instrument(Object.assign({}, options, __INSTRUMENTS__[instrument]))
  }

  constructor({ config: configFn, storage: storageFns, ...options }) {
    this.config = configFn.call(null, options)
    this.storageFns = storageFns
  }

  increment({ x, y, z }) {
    let labelIndex = this.indexOf(x)
    if (labelIndex === -1) {
      this.pushDataset(x, { y: 1, z })
    } else {
      this.storageFns.increment.call(this.config, labelIndex, { x, y, z })
    }
  }

  indexOf(label) {
    return this.storageFns.indexOf.call(this.config, label)
  }

  pushDataset(label, data) {
    return this.storageFns.pushDataset.call(this.config, label, data)
  }

  pushData({ x: label, ...rest }) {
    let labelIndex = this.indexOf(label)
    if (labelIndex === -1) {
      this.pushDataset(label, rest)
    } else {
      this.storageFns.pushData.call(this.config, labelIndex, rest)
    }
  }
}

/** Telemetry Metrics **/

// Displays the last measurement received
class LastValue {
  constructor(instrument, _options) {
    this.instrument = instrument
  }

  pushData(data) {
    data.forEach((item) => this.instrument.pushData(item))
  }
}

// Displays a count of each event received
class Counter {
  constructor(instrument, _options) {
    this.instrument = instrument
  }

  pushData(data) {
    data.forEach(({ x, z }) => this.instrument.increment({ x, y: 1, z }))
  }
}

// Displays the sum of the values received
class Sum {
  constructor(instrument, _options) {
    this.instrument = instrument
  }

  pushData(data) {
    data.forEach((item) => this.instrument.increment(item))
  }
}

// Displays a measurement summary
class Summary {
  constructor(instrument, _options) {
    // TODO: Get percentiles from options
    this.instrument = instrument
  }

  pushData(data) {
    data.forEach((item) => this.instrument.pushData(item))
  }
}

const __METRICS__ = {
  counter: Counter,
  last_value: LastValue,
  sum: Sum,
  summary: Summary
}

class TelemetryChart {
  constructor(elementOrContext, { metric: metric, ...options }) {
    this.instrument = Instrument.create(options)
    this.metric = new __METRICS__[metric](this.instrument, options)
    this.datasets = [
      { key: "|x|", data: [] }
    ]
    this.chart = new uPlot(this.instrument.config, [[], []], elementOrContext)
    // Delete the auto-generated series
    this.chart.delSeries(this.chart.series.length - 1)
  }

  pushData(data) {
    if (!data.length) return

    data.forEach(({ z: dateString, y: valueString, x: key }) => {
      let ts_seconds = (new Date(dateString)).getTime() / 1000
      let value = parseFloat(valueString)

      // Find or create the series from the x-axis value
      let seriesIndex = this.datasets.findIndex(({ key: seriesKey }) => seriesKey === key)
      if (seriesIndex === -1) {
        seriesIndex = this.datasets.push({ key, data: Array(this.datasets[0].data.length).fill(null) }) - 1
        this.chart.addSeries({
          label: key,
          ...LineColor.at(seriesIndex - 1)
        }, seriesIndex)
      }

      this.datasets = this.datasets.map((dataset, index) => {
        if (index == 0) {
          dataset.data.push(ts_seconds)
        } else if (dataset.key == key) {
          dataset.data.push(value)
        } else {
          dataset.data.push(null)
        }
        return dataset
      })
    })

    this.chart.setData(this.datasets.slice(0).map(({ data }) => data))
  }
}

/** LiveView Hook **/

const PhxChartComponent = {
  mounted() {
    let wrapper = this.el.parentElement.querySelector('.chart')
    let size = wrapper.getBoundingClientRect()
    let options = Object.assign({}, wrapper.dataset, {
      instrument: 'timeseries',
      tagged: (wrapper.dataset.tags && wrapper.dataset.tags !== "") || false,
      width: size.width,
      height: 300,
      now: (new Date()).getTime() / 1000
    })

    this.chart = new TelemetryChart(wrapper, options)
  },
  updated() {
    const data = Array
      .from(this.el.children || [])
      .map(({ dataset: { x, y, z } }) => { return { x, y, z } })

    if (data.length > 0) {
      this.chart.pushData(data)
    }
  }
}

export default PhxChartComponent
