const $ = require('jquery')

const vm = new Vue({
  el: '#app',
  data() {
    const ua = navigator.userAgent
    return {
      channelList: [],
      mapChannel: {},
      columnList: [],
      mapColumn: {},
      router: {
        cur: {}
      },
      is: {
        loading: true,
        replaceHistory: false,
        changeChannelByClick: false,
        win: ua.indexOf('Microsoft') > -1,
        mac: ua.indexOf('Mac OS') > -1,
        displayQR: false,
      },
      timer: {
        lazyLoad: 0,
        filterVideo: 0,
      },
      pathCache: {
        time: './cache/cache.time',
        cache: './cache/cache.json',
      },
      video: {
        url: ''
      },
      searchList: [],
      href: '',
    }
  },
  computed: {
    curColumnList() {
      const root = this.$root
      return (root.channelList[root.router.cur.channel] || {}).columnList || []
    },
    curColumn() {
      const root = this.$root
      return root.curColumnList[root.router.cur.column] || {videos: []}
    },
    videos() {
      const root = this.$root
      const videos = root.curColumn.videos || []
      root.filterVideosInTimeout(videos)
      return videos
    }
  },
  watch: {
    router: {
      deep: true,
      handler(newVal) {
        const root = this.$root
        let href = location.origin + location.pathname + '#' + JSON.stringify(root.router)
        history[root.is.replaceHistory ? 'replaceState' : 'pushState']({}, '', href)
        root.href = href.replace(/^.*#/, '')
        root.is.replaceHistory = false
      }
    },
    'router.cur.channel'() {
      const root = this.$root
      root.is.replaceHistory = true
      if (root.is.changeChannelByClick) {
        root.router.cur.column = 0
      }
      root.is.changeChannelByClick = false
      root.getVides()
    },
    'router.cur.column'() {
      const root = this.$root
      root.getVides()
    },
    'router.m3u8'(newVal) {
      const root = this.$root
      if (!newVal) {
        root.router.currentTime = 0
        root.is.loading = false
        return
      }
      let currentTime = root.router.currentTime || 80
      console.log(newVal)
      root.$nextTick(function() {
        if (Hls.isSupported()) {
          var video = document.getElementById('video')
          var hls = new Hls()
          video.oncanplay = function() {
            root.is.loading = false
          }
          hls.loadSource(root.router.m3u8)
          hls.attachMedia(video)
          hls.on(Hls.Events.MANIFEST_PARSED, function() {
            video.pause()
            video.currentTime = currentTime
            video.play()
          })
        }
      })
    },
    'router.searchText'(newVal) {
      const root = this.$root
      root.filterVideosInTimeout()
    }
  },
  methods: {
    routerInit() {
      const root = this.$root
      let r = {}

      try {
        r = JSON.parse(decodeURIComponent(location.hash.substring(1)))
      } catch (e) {
        console.log('hash parse err')
      }

      r.page = r.page || 'page-index'
      r.cur = r.cur || {}
      r.cur.channel = r.cur.channel || 0
      r.cur.column = r.cur.column || 0
      r.currentTime = r.currentTime || ''
      r.searchText = r.searchText || ''
      r.m3u8 = r.m3u8 || ''
      root.is.replaceHistory = true
      root.router = r
    },
    saveColumnList() {
      const root = this.$root
      fs.writeFileSync(root.pathCache.cache, JSON.stringify(root.columnList))
    },
    clickChannel(item, idx) {
      const root = this.$root
      root.is.changeChannelByClick = true
      root.router.cur.channel = idx
      root.router.m3u8 = ''
    },
    clickColumn(item, idx) {
      const root = this.$root
      root.router.cur.column = idx
      root.router.m3u8 = ''
    },
    initChannel(columnList) {
      const root = this.$root
      const channelList = []
      const mapChannel = {}
      const mapColumn = {}

      columnList.forEach(function(v, i) {
        mapChannel[v.channel_name] = mapChannel[v.channel_name] || []
        mapChannel[v.channel_name].push(v)
        mapColumn[v.column_name] = v
      })

      for (let key in mapChannel) {
        channelList.push({
          id: parseInt((key.match(/\d+/) || [])[0] || 0),
          channelName: key,
          columnList: mapChannel[key],
        })
      }

      channelList.sort(function(a, b) {
        return a.id - b.id
      })

      root.channelList = channelList
      root.mapChannel = mapChannel
      root.columnList = columnList
      root.mapColumn = mapColumn
      root.is.loading = false

      root.getVides()
    },
    getColumnList(cb) {
      const root = this.$root
      let columnList = []
      let p = 0

      function loop() {
        $.getJSON('http://api.cntv.cn/lanmu/columnSearch?&p=' + (++p) + '&n=200&serviceId=tvcctv&t=jsonp&cb=?', function(data) {
          const d = (data.response || {}).docs || []
          columnList = columnList.concat(d.map(function(v, i) {
            return {
              // column_id: v.column_id,
              // channel_id: v.channel_id,
              column_name: v.column_name,
              channel_name: v.channel_name,
              column_logo: v.column_logo,
              column_photo: v.column_photo,
              column_topicid: v.column_topicid,
              page: 0,
              isLoadAll: false,
              videos: [],
            }
          }))
          if (d.length < 100) {
            fs.writeFileSync(root.pathCache.time, +new Date())
            cb && cb(columnList)
            root.saveColumnList()
            return
          }
          loop()
        })
      }

      try {
        const cacheDate = new Date(parseInt(fs.readFileSync(root.pathCache.time)))
        const oDate = new Date()
        if (
          oDate.getTime() - cacheDate.getTime() > 24 * 60 * 60 * 1000 ||
          oDate.getDate() != cacheDate.getDate()
        ) {
          throw new Error('过期了')
        }
        cb && cb(JSON.parse(fs.readFileSync(root.pathCache.cache)))
      } catch (e) {
        console.log('加载新数据 columnList')
        loop()
      }
    },
    getVides() {
      const root = this.$root
      let curColumn = root.curColumn

      function loop(cb) {
        $.getJSON('http://api.cntv.cn/lanmu/videolistByColumnId?id=' + curColumn.column_topicid + '&n=200&of=fdate&p=' + (curColumn.page + 1) + '&type=0&serviceId=tvcctv&cb=?', function(data) {
          curColumn.page++
          const d = (data.response || {}).docs || []
          curColumn.videos = curColumn.videos.concat(d.map(function(v, i) {
            return {
              videoTitle: v.videoTitle,
              videoTag: v.videoTag,
              videoBrief: v.videoBrief,
              videoKeyFrameUrl: v.videoKeyFrameUrl,
              videoId: v.videoId,
              videoSharedCode: v.videoSharedCode,
            }
          }))
          if (curColumn.page === 1) {
            root.lazyLoadInNextTick()
          }
          curColumn.isLoadAll = d.length < 100 || curColumn.column_name === '新闻联播'
          root.saveColumnList()
          if (curColumn.isLoadAll) {
            curColumn.isLoadAll = true
          } else {
            loop()
          }
        })
      }
      if (curColumn.isLoadAll) {
        root.lazyLoadInNextTick()
      } else {
        loop()
      }
    },
    filterVideos(videos) {
      const root = this.$root
      const searchText = (root.router.searchText || '').trim()
      videos = videos || root.videos
      videos.forEach(function(v, i) {
        root.$set(v, 'isAccord',
          !searchText ||
          v.videoTitle.indexOf(searchText) > -1 ||
          v.videoTag.indexOf(searchText) > -1 ||
          v.videoBrief.indexOf(searchText) > -1
        )
      })
      root.lazyLoadInNextTick()
    },
    filterVideosInTimeout() {
      const root = this.$root
      clearTimeout(root.timer.filterVideo)
      root.timer.filterVideo = setTimeout(root.filterVideos, 300)
    },
    userExec(cmd) {
      const root = this.$root
      switch (cmd) {
        case '清缓存':
          fs.unlinkSync(root.pathCache.time)
          root.channelList = []
          root.mapChannel = {}
          root.columnList = []
          root.mapColumn = {}
          root.getColumnList(root.initChannel)
          break
        case '设置':
          
          break
        case '用户信息':
          
          break
        case '退出':
          
          break
        case '关闭视频':
          root.router.m3u8 = ''
          break
        case '二维码':
          root.is.displayQR = true
          $('#app .qr-box').each(function() {
            this.innerHTML = ''
            new QRCode(this, {
              text: root.router.m3u8,
              width: 370,
              height: 370,
              colorDark: '#000000',
              colorLight: '#ffffff',
            });
          })
          break
      }
    },
    lazyLoad(mustLoad) {
      const root = this.$root
      if (mustLoad) {
        relLoad()
      } else {
        clearTimeout(root.timer.lazyLoad)
        root.timer.lazyLoad = setTimeout(relLoad, 200)
      }

      function relLoad() {
        const nodes = [].slice.call(document.querySelectorAll('[lazy-load]'))
        const t = 90
        const b = document.documentElement.clientHeight
        nodes.forEach(function(node, i) {
          const pos = node.getBoundingClientRect()
          if (pos.top > b || pos.bottom < t) {
            return
          }
          const src = node.getAttribute('lazy-load')
          node.removeAttribute('lazy-load')
          node.style.backgroundImage = 'url(' + src + ')'
        })
      }
    },
    lazyLoadInNextTick() {
      const root = this.$root
      root.$nextTick(function() {
        root.lazyLoad('mustLoad')
      })
    },
    getM3u8Address(e) {
      const root = this.$root
      $(e.target).closest('li').each(function() {
        const idx = $(this).index()
        const v = root.videos[idx]
        root.is.loading = true
        get({
          url: 'http://vdn.apps.cntv.cn/api/getIpadVideoInfo.do?pid=' + v.videoSharedCode + '&tai=ipad&from=html5&tsp=1513429887&vn=2049&vc=747D258B9ACE300ABA7C47B708C99495&uid=B55F93A05CDAE4A93D58FAEC106E2DF2&wlan=',
          succ(str) {
            const data = JSON.parse(str.match(/\{.*\}/) || '{}')
            root.is.loading = true
            console.log(data.hls_url)
            root.router.m3u8 = data.hls_url/*.replace(/\?.*$/, '')*/
          },
          err(e) {
            alert(e)
            root.is.loading = false
          }
        })
      })
    },
    enterFullScreenOrNot(e) {
      $('#video').each(function() {
        this[!this.webkitDisplayingFullscreen  ? 'webkitEnterFullScreen' : 'webkitExitFullscreen']()
      })
    },
    videoOnTimeUpdate(e) {
      const root = this.$root
      const node = e.target
      $(e.target).closest('body').each(function() {
        root.is.replaceHistory = true
        root.router.currentTime = parseInt(node.currentTime)
      })
    },
    playVideoOrPause() {
      $('#video').each(function() {
        this[this.paused ? 'play' : 'pause']()
      })
    },
    quickForward() {
      $('#video').each(function() {
        this.currentTime += 10
      })
    },
    qucikBack() {
      $('#video').each(function() {
        this.currentTime -= 10
      })
    },
    upperVolume() {
      $('#video').each(function() {
        this.volume += .1
      })
    },
    lowerVolume() {
      $('#video').each(function() {
        this.volume -= .1
      })
    },
  },
  mounted() {
    const root = this.$root

    root.routerInit()
    window.addEventListener('popstate', function(e) {
      root.routerInit()
    })

    try {
      fs.mkdirSync('/cache')
    } catch (e) {
      console.log(e)
    }
    root.getColumnList(root.initChannel)

    $(window).on('resize', function() {
      root.lazyLoad()
    })
  }
})

$(document).on('keydown', function(e) {
  /*switch (e.keyCode) {
    case 32:
      vm.playVideoOrPause()
      break
  }*/
  const isCtrlKey = e.ctrlKey || e.metaKey
  const isAltKey = e.altKey
  const isShiftKey = e.shiftKey
  const keyMap = {
    '13': 'enter',
    '27': 'esc',
    '32': 'space',
    '37': 'left',
    '38': 'top',
    '39': 'right',
    '40': 'bottom',
  }
  const sKey = keyMap[e.keyCode]

  if (isCtrlKey && isShiftKey && isAltKey) {
    switch (sKey) {

    }
  } else if (isCtrlKey && isShiftKey) {
    switch (sKey) {

    }
  } else if (isCtrlKey && isAltKey) {
    switch (sKey) {

    }
  } else if (isShiftKey && isAltKey) {
    switch (sKey) {

    }
  } else if (isCtrlKey) {
    switch (sKey) {
      case 'enter':
        vm.enterFullScreenOrNot()
        break
    }
  } else if (isAltKey) {
    switch (sKey) {

    }
  } else if (isShiftKey) {
    switch (sKey) {

    }
  } else {
    switch (sKey) {
      case 'space':
        vm.playVideoOrPause()
        break
      case 'left':
        vm.qucikBack()
        break
      case 'right':
        vm.quickForward()
        break
      case 'top':
        vm.upperVolume()
        break
      case 'bottom':
        vm.lowerVolume()
        break
    }
  }

})