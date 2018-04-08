const http = require('http')
const fs = require('fs')

Array.prototype.remove = function(item) {
  for (let i = 0; i < this.length; i++) {
    if (this[i] == item) {
      this.splice(i, 1)
      i--
    }
  }
  return this
}

Array.prototype.uniqueHead = function(item) {
  this.remove(item)
  this.unshift(item)
  return this
}

String.prototype.fill = function(len = 2, by = '0', isForward) {
  let s = this.toString()
  while (s.length < len) {
    s = isForward ? (s + by) : (by + s)
  }
  return s
}

fs.rm = function(path) {
  path = path.replace(/\/+$/, '')

  function loop(path) {
    try {
      const stat = fs.statSync(path)
      if (stat.isDirectory()) {
        const fileList = fs.readdirSync(path)
        for (let i = 0, len = fileList.length; i < len; i++) {
          loop(path + '/' + fileList)
        }
        fs.rmdirSync(path)
      } else {
        fs.unlinkSync(path)
      }
    } catch (e) {
      console.log(e)
    }
  }
  loop(path)
}

function json2URL(json) {
  let arr = []
  for (let key in json) {
    json[key] !== undefined && arr.push(key + '=' + encodeURIComponent(json[key]))
  }
  return arr.join('&')
}


function get(o) {
  if (!navigator.onLine) {
    o.err && o.err('你断网了，请保持网络畅通')
    return
  }

  http.get(o.url, function(res) {
    let d = ''
    res.on('data', function(c) {
      d += c
    })
    res.on('end', function() {
      o.succ && o.succ(d)
    })
  })
}