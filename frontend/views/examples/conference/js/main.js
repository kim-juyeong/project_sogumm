/*!
 *
 * WebRTC Lab
 * @author dodortus (dodortus@gmail.com / codejs.co.kr)
 *
 */
$(function () {
  console.log('Loaded Main');

  let roomId;
  let userId;
  let remoteUserId;
  let isOffer;
  let users = [];

  const socket = io();
  const mediaHandler = new MediaHandler();
  const peerHandler = new PeerHandler({
    send: send,
  });
  const animationTime = 500;
  const isSafari = DetectRTC.browser.isSafari;
  const isMobile = DetectRTC.isMobileDevice;
  const mediaOption = {
    audio: true,
    video: {
      mandatory: {
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 30,
      },
      optional: [
        { googNoiseReduction: true }, // Likely removes the noise in the captured video stream at the expense of computational effort.
        { facingMode: 'user' }, // Select the front/user facing camera or the rear/environment facing camera if available (on Phone)
      ],
    },
  };

  // DOM
  const $body = $('body');
  const $createWrap = $('#create-wrap');
  const $waitWrap = $('#wait-wrap');
  const $videoWrap = $('#video-wrap');
  const $uniqueToken = $('#unique-token');

  /**
   * 입장 후 다른 참여자 발견시 호출
   */
  function onDetectUser() {
    console.log('onDetectUser');

    $waitWrap.html(
      [
        '<div class="room-info">',
        '<p>당신을 기다리고 있어요. 참여 하실래요?</p>',
        '<button id="btn-join">Join</button>',
        '</div>',
      ].join('\n')
    );

    $('#btn-join').click(function () {
      isOffer = true;
      peerHandler.getUserMedia(mediaOption, onLocalStream, isOffer);
      $(this).attr('disabled', true);
    });

    $createWrap.slideUp(animationTime);
  }

  /**
   * 참석자 핸들링
   * @param roomId
   * @param userList
   */
  function onJoin(roomId, userList) {
    console.log('onJoin', userList);
    for (var user in userList) {
      users.push(userList[user])
    }
    if (Object.size(userList) > 1) {
      onDetectUser();
    }
  }

  /**
   * 이탈자 핸들링
   * @param userId
   */
  function onLeave(userId) {
    console.log('onLeave', arguments);

    if (remoteUserId === userId) {
      $('#remote-video').remove();
      $body.removeClass('connected').addClass('wait');
      remoteUserId = null;
    }
  }

  /**
   * 소켓 메세지 핸들링
   * @param data
   */
  function onMessage(data) {
    console.log('onMessage', arguments);

    if (!remoteUserId) {
      remoteUserId = data.sender;
    }

    if (data.sdp || data.candidate) {
      peerHandler.signaling(data);
    } else {
      // etc
    }
  }

  /**
   * 소켓 메시지 전송
   * @param data
   */
  function send(data) {
    console.log('send', arguments);
    data.roomId = roomId;
    data.sender = userId;
    socket.send(data);
  }

  /**
   * 방 고유 접속 토큰 생성
   */
  function setRoomToken() {
    const hashValue = (Math.random() * new Date().getTime())
      .toString(32)
      .toUpperCase()
      .replace(/\./g, '-');

    if (location.hash.length > 2) {
      $uniqueToken.attr('href', location.href);
    } else {
      location.hash = '#' + hashValue;
    }
  }

  /**
   * 클립보드 복사
   */
  function setClipboard() {
    $uniqueToken.click(function () {
      const link = location.href;

      if (window.clipboardData) {
        window.clipboardData.setData('text', link);
        alert('Copy to Clipboard successful.');
      } else {
        window.prompt('Copy to clipboard: Ctrl+C, Enter', link); // Copy to clipboard: Ctrl+C, Enter
      }
    });
  }

  /**
   * 로컬 스트림 핸들링
   * @param stream
   */
  function onLocalStream(stream) {
    $videoWrap.prepend('<video id="local-video" muted="muted" autoplay />');
    const localVideo = document.querySelector('#local-video');
    mediaHandler.setVideoStream({
      type: 'local',
      el: localVideo,
      stream: stream,
    });

    $body.addClass('room wait');

    if (isMobile && isSafari) {
      mediaHandler.playForIOS(localVideo);
    }
  }

  /**
   * 상대방 스트림 핸들링
   * @param stream
   */
  function onRemoteStream(stream) {
    console.log('onRemoteStream', stream);

    $videoWrap.prepend('<video id="remote-video" autoplay />');
    const remoteVideo = document.querySelector('#remote-video');
    mediaHandler.setVideoStream({
      type: 'remote',
      el: remoteVideo,
      stream: stream,
    });

    $body.removeClass('wait').addClass('connected');

    if (isMobile && isSafari) {
      mediaHandler.playForIOS(remoteVideo);
    }
  }

  /**
   * 여기부터 음성관련 코드
   */

  if (typeof webkitSpeechRecognition !== 'function') {
    alert('크롬에서만 동작 합니다.');
    return false;
  }

  const FIRST_CHAR = /\S/;
  const TWO_LINE = /\n\n/g;
  const ONE_LINE = /\n/g;

  const recognition = new webkitSpeechRecognition();
  const language = 'ko-KR';
  const $audio = document.querySelector('#audio');
  const $btnMic = document.querySelector('#btn-mic');
  const $resultWrap = document.querySelector('#result');
  const $resultWrap2 = document.querySelector('#result2');
  const $iconMusic = document.querySelector('#icon-music');

  let isRecognizing = false;
  let ignoreEndProcess = false;
  let finalTranscript = '';

  recognition.continuous = true;
  recognition.interimResults = true;

  /**
   * 음성 인식 시작 처리
   */
  recognition.onstart = function () {
    console.log('onstart', arguments);
    isRecognizing = true;
    $btnMic.className = 'on';
  };

  /**
   * 음성 인식 종료 처리
   */
  recognition.onend = function () {
    console.log('onend', arguments);
    isRecognizing = false;

    if (ignoreEndProcess) {
      return false;
    }

    // DO end process
    $btnMic.className = 'off';
    if (!finalTranscript) {
      console.log('empty finalTranscript');
      return false;
    }
  };

  /**
   * 음성 인식 결과 처리
   */
  let context = {}
  socket.on('inwoo', (data) => {
    for (var key in data) {
      context[key] = data[key];
    }
    // 여기서 값처리
    let another = 0;
    for (var i in users) {
      if (userId != users[i]) {
        another = users[i];
      }
    }
    another_f = another + '_f';
    another_i = another + '_i';
    final_span2.innerHTML = context[another_f];
    interim_span2.innerHTML = context[another_i];

  });

  recognition.onresult = function (event) {
    console.log('onresult', event);

    let interimTranscript = '';
    if (typeof event.results === 'undefined') {
      recognition.onend = null;
      recognition.stop();
      return;
    }

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const transcript = event.results[i][0].transcript;

      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    finalTranscript = capitalize(finalTranscript);
    final_span.innerHTML = linebreak(finalTranscript);
    interim_span.innerHTML = linebreak(interimTranscript);
    $resultWrap.scrollTop = $resultWrap.scrollHeight;
    $resultWrap2.scrollTop = $resultWrap2.scrollHeight;

    userId_f = userId + '_f';
    userId_i = userId + '_i';
    context[userId_f] = finalTranscript;
    context[userId_i] = interimTranscript;
    socket.emit('inu', context);
    // 여기서 값처리
    let another = 0;
    for (var i in users) {
      if (userId != users[i]) {
        another = users[i];
      }
    }
    another_f = another + '_f';
    another_i = another + '_i';
    final_span2.innerHTML = context[another_f];
    interim_span2.innerHTML = context[another_i];

    console.log('finalTranscript', finalTranscript);
    console.log('interimTranscript', interimTranscript);
    fireCommand(interimTranscript);
  };

  /**
   * 음성 인식 에러 처리
   */
  recognition.onerror = function (event) {
    console.log('onerror', event);

    if (event.error.match(/no-speech|audio-capture|not-allowed/)) {
      ignoreEndProcess = true;
    }

    $btnMic.className = 'off';
  };

  /**
   * 명령어 처리
   * @param string
   */
  function fireCommand(string) {
    if (string.endsWith('레드')) {
      $resultWrap.className = 'red';
    } else if (string.endsWith('블루')) {
      $resultWrap.className = 'blue';
    } else if (string.endsWith('그린')) {
      $resultWrap.className = 'green';
    } else if (string.endsWith('옐로우')) {
      $resultWrap.className = 'yellow';
    } else if (string.endsWith('오렌지')) {
      $resultWrap.className = 'orange';
    } else if (string.endsWith('그레이')) {
      $resultWrap.className = 'grey';
    } else if (string.endsWith('골드')) {
      $resultWrap.className = 'gold';
    } else if (string.endsWith('화이트')) {
      $resultWrap.className = 'white';
    } else if (string.endsWith('블랙')) {
      $resultWrap.className = 'black';
    } else if (string.endsWith('알람') || string.endsWith('알 람')) {
      alert('알람');
    } else if (string.endsWith('노래 켜') || string.endsWith('음악 켜')) {
      $audio.play();
      $iconMusic.classList.add('visible');
    } else if (string.endsWith('노래 꺼') || string.endsWith('음악 꺼')) {
      $audio.pause();
      $iconMusic.classList.remove('visible');
    } else if (string.endsWith('볼륨 업') || string.endsWith('볼륨업')) {
      $audio.volume += 0.2;
    } else if (string.endsWith('볼륨 다운') || string.endsWith('볼륨다운')) {
      $audio.volume -= 0.2;
    } else if (string.endsWith('스피치') || string.endsWith('말해줘') || string.endsWith('말 해 줘')) {
      textToSpeech($('#final_span').text() || '전 음성 인식된 글자를 읽습니다.');
    }
  }

  /**
   * 개행 처리
   * @param {string} s
   */
  function linebreak(s) {
    return s.replace(TWO_LINE, '<p></p>').replace(ONE_LINE, '<br>');
  }

  /**
   * 첫문자를 대문자로 변환
   * @param {string} s
   */
  function capitalize(s) {
    return s.replace(FIRST_CHAR, function (m) {
      return m.toUpperCase();
    });
  }

  /**
   * 음성 인식 트리거
   */
  function start() {
    if (isRecognizing) {
      recognition.stop();
      return;
    }
    recognition.lang = language;
    recognition.start();
    ignoreEndProcess = false;

    finalTranscript = '';
    final_span.innerHTML = '';
    interim_span.innerHTML = '';
  }

  /**
   * 문자를 음성으로 읽어 줍니다.
   * 지원: 크롬, 사파리, 오페라, 엣지
   */
  function textToSpeech(text) {
    console.log('textToSpeech', arguments);

    // speechSynthesis options
    // const u = new SpeechSynthesisUtterance();
    // u.text = 'Hello world';
    // u.lang = 'en-US';
    // u.rate = 1.2;
    // u.onend = function(event) {
    //   log('Finished in ' + event.elapsedTime + ' seconds.');
    // };
    // speechSynthesis.speak(u);

    // simple version
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  /**
   * 초기 설정
   */
  function initialize() {
    roomId = location.href.replace(/\/|:|#|%|\.|\[|\]/g, '');
    userId = Math.round(Math.random() * 99999);
    setRoomToken();
    setClipboard();

    // 소켓 관련 이벤트 바인딩
    socket.emit('enter', roomId, userId);
    socket.on('join', onJoin);
    socket.on('leave', onLeave);
    socket.on('message', onMessage);
    // Peer 관련 이벤트 바인딩
    peerHandler.on('addRemoteStream', onRemoteStream);

    $('#btn-start').click(function () {
      peerHandler.getUserMedia(mediaOption, onLocalStream);
    });

    $('#btn-camera').click(function () {
      const $this = $(this);
      $this.toggleClass('active');
      mediaHandler[$this.hasClass('active') ? 'pauseVideo' : 'resumeVideo']();
    });

    $('#btn-mic').click(function () {
      const $this = $(this);
      $this.toggleClass('active');
      mediaHandler[$this.hasClass('active') ? 'muteAudio' : 'unmuteAudio']();
    });
  }
  /**
   * 초기 바인딩
   */
  function initialize2() {
    const $btnTTS = document.querySelector('#btn-tts');
    const defaultMsg = '전 음성 인식된 글자를 읽습니다.';

    $btnTTS.addEventListener('click', () => {
      const text = final_span.innerText || defaultMsg;
      textToSpeech(text);
    });
    start()
    $btnMic.addEventListener('click', start);
  }

  initialize();
  initialize2();
});
