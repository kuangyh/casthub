window.app = {};
(function() {

app.CastHub = function(el) {
  this._el = el;

  // UI
  this._updateInterval = null;
  this._seeking = false;
  this._bindUI();
  this._updateUI();

  // Cast API
  this._castApiInited = false;
  this._castSession = null;
  this._mediaSession = null;
  setTimeout(this._initCastAPI.bind(this), 1000);
};

app.CastHub.prototype.connect = function() {
  chrome.cast.requestSession(
      this._onSessionConnected.bind(this), this._eventLogger('LaunchError'));
};

app.CastHub.prototype.disconnect = function() {
  session = this._castSession;
  this._castSession = null;
  this._updateUI();
  session.stop(
    this._eventLogger('SessionStopSucc'),
    this._eventLogger('SessionStopError'));
};

app.CastHub.prototype.loadMedia = function(url) {
  if (!this._castSession) {
    console.log('Cast session not initialized');
    return;
  }
  var mediaInfo = new chrome.cast.media.MediaInfo(url);
  mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
  mediaInfo.metadata.metadataType = chrome.cast.media.MetadataType.GENERIC;
  mediaInfo.contentType = 'video/mp4';

  var request = new chrome.cast.media.LoadRequest(mediaInfo);
  request.autoplay = true;
  request.currentTime = 0;

  this._castSession.loadMedia(
    request, this._onMediaDiscovered.bind(this), this._eventLogger('LoadMediaError', true));
};

app.CastHub.prototype.stopMedia = function() {
  if (!this._mediaSession) {
    console.log('Not media to stop');
    return;
  }
  var mediaSession = this._mediaSession;
  this._mediaSession = null;
  if (this._updateInterval) {
    clearInterval(this._updateInterval);
    this._updateInterval = null;
  }
  mediaSession.stop(
      null,
      this._eventLogger('StopMediaSucc', true),
      this._eventLogger('StopMediaError', true));
};

app.CastHub.prototype.seekMedia = function(pos) {
  if (this._seeking || !this._mediaSession || !this._mediaSession.media.duration) {
    return;
  }
  this._seeking = true;
  var request = new chrome.cast.media.SeekRequest();
  request.currentTime = pos * this._mediaSession.media.duration / 100;

  var onSeekDone = function(msg) {
    if (msg) {
      console.log(msg)
    }
    this._seeking = false;
    this._updateUI();
  };
  this._mediaSession.seek(request, onSeekDone.bind(this, 'SeekDone'), onSeekDone.bind(this, 'SeekError'));
};

app.CastHub.prototype._bindUI = function() {
  var playFromInput =
  this._ui('play').onclick = (function() {
    this.loadMedia(this._ui('url').value);
  }).bind(this);
  this._ui('url').onkeyup = (function(e) {
    if (e.key == 'Enter') {
      this.loadMedia(this._ui('url').value);
    }
  }).bind(this);
  this._ui('progress').onmouseup = (function(e) {
    this.seekMedia(e.target.value);
  }).bind(this);
}

function formatDuration(duration) {
  var formatDigit = function(n) {
    n = Math.floor(n);
    return n < 10 ? '0' + n : n;
  };
  var secs = duration % 60;
  var mins = (duration / 60) % 60;
  var hours = parseInt(duration / 3600, 10);
  if (hours > 0) {
    return '' + hours + ':' + formatDigit(mins) + ':' + formatDigit(secs);
  } else {
    return formatDigit(mins) + ':' + formatDigit(secs);
  }
}

app.CastHub.prototype._updateUI = function(items) {
  var statusText = 'Disconnected';
  if (this._castSession) {
    statusText = 'Connected';
    if (this._mediaSession) {
      if (this._mediaSession.media.duration > 0) {
        var remain = this._mediaSession.media.duration - this._mediaSession.getEstimatedTime();
        statusText = formatDuration(remain);
      } else {
        statusText = 'LIVE';
      }
    }
  }
  this._ui('status').innerText = statusText;

  if (items && items['url']) {
    this._ui('url').value = items['url'];
  }

  if (this._mediaSession && this._mediaSession.media.duration > 0) {
    this._ui('progress').disabled = false;
    var s = this._mediaSession
    this._ui('progress').value = (s.getEstimatedTime() / s.media.duration) * 100.0;
  } else {
    this._ui('progress').disabled = true;
  }
};

app.CastHub.prototype._ui = function(name) {
  return this._el.querySelector('.casthub-' + name);
}

app.CastHub.prototype._initCastAPI = function() {
  var request = new chrome.cast.SessionRequest(chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID);
  var sessionRequest = new chrome.cast.SessionRequest(
      chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID);
  var apiConfig = new chrome.cast.ApiConfig(sessionRequest,
    this._onSessionConnected.bind(this),
    this._eventLogger('Receiver'),
    chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED);
  chrome.cast.initialize(
    apiConfig,
    (function() {
      this._castApiInited = true;
      this._updateUI();
    }).bind(this),
    this._eventLogger('CastInitError'));
};

app.CastHub.prototype._eventLogger = function(prefix, needUpdateUI) {
  return (function(e) {
    console.log(prefix + ':' + e);
    if (needUpdateUI) {
      this._updateUI();
    }
  }).bind(this);
};

app.CastHub.prototype._onSessionConnected = function(session) {
  this._castSession = session;
  session.addUpdateListener(this._onSessionChanged.bind(this));
  if (session.media.length > 0) {
    this._onMediaDiscovered(session.media[0]);
  }
  session.addMediaListener(this._onMediaDiscovered.bind(this));
  this._updateUI();
};

app.CastHub.prototype._onSessionChanged = function(isAlive) {
  if (!isAlive) {
    console.log('Session disconnected');
    this._castSession = null;
    this._updateUI();
  }
};

app.CastHub.prototype._onMediaDiscovered = function(mediaSession) {
  this._mediaSession = mediaSession;
  this._mediaSession.addUpdateListener(this._updateUI.bind(this));
  if (!this._updateInterval) {
    this._updateInterval = setInterval(this._updateUI.bind(this), 1000);
  }
  this._updateUI({'url': this._mediaSession.media.contentId});
};

}).call(window);
