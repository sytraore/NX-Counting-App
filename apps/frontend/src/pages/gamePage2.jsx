import React, { useState, useEffect, useRef } from "react";
import { useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import "../styles/gamePage.css";
import { useAppData } from "../context/Context.jsx";
import Tray1 from "../assests/TrayB.png";
import BigBird from "../assests/BigBird.png";
import greenTray from "../assests/greenTray.png";
import purpleTray from "../assests/purpleTray.png";
import "bootstrap/dist/css/bootstrap.css";
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import Animation from "../components/animation.jsx";
import { useSound } from '../helpers/SoundContext.jsx';
import { textToSpeech2 } from '../helpers/textToSpeech2';
import { speechToText } from '../helpers/speechtoText';
import DialogBox from "../components/dialogBox.jsx";
import { handleInteraction, handleNextClickTouchData } from '../helpers/imageTouchData';
import { saveAnswers } from "../helpers/SaveAnswers";

const GamePage2 = () => {
  const { Data, audioData, selectedOption } = useAppData();
  const { page } = useParams();
  const currentPage = parseInt(page);
  const [cookieCount, setCookieCount] = useState(0);
  const [showBigBird, setShowBigBird] = useState(false);
  const [showTray2, setShowTray2] = useState(false);
  const [selectedTray, setSelectedTray] = useState(null);
  const [showMessage, setShowMessage] = useState(false);
  const [activeCookieId, setActiveCookieId] = useState(0);
  const [showGrayArea, setshowGrayArea] = useState(false);
  const [isWiggling, setIsWiggling] = useState(false);
  const spokenRef = useRef(false);
  const spokenRef2 = useRef(false);
  const once = useRef(false);
  const { soundEnabled } = useSound();
  const [modalShow, setModalShow] = useState(false);
  const [startAnimation, setstartAnimation] = useState(false);
  const [touchData, setTouchData] = useState([]);
  const clickedCookies = new Set();
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [sttError, setSttError] = useState(null);
  const [spokenNumbers, setSpokenNumbers] = useState(new Set());
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const handleAnimationFinish = () => {
    setTimeout(() => {
      const audioElement2 = new Audio();
      switch (Data.pages[currentPage].cookies.length) {
        case 5:
          audioElement2.src = audioData.circling.total5;
          break;
        case 10:
          audioElement2.src = audioData.circling.total10;
          break;
        default:
          return;
      }
      audioElement2.play();
      audioElement2.onended = () => {
        if (!spokenRef2.current) {
          setTimeout(() => {
            setshowGrayArea(true);
            setstartAnimation(false);
            setShowMessage(true);
            setShowBigBird(true);
            setShowTray2(true);
            if (soundEnabled) {
              const utterance = `Can Big Bird also have ${Data.pages[currentPage].cookies.length} cookies? Which tray has ${Data.pages[currentPage].cookies.length} cookies? Green or purple?`;
              textToSpeech2 (utterance);
            }
            spokenRef2.current = true;
          }, 1000);
        }
      };
    }, 1000);
  };

  const speakUtterance = () => {
    if (soundEnabled) {
      const utterance = `Cookie Monster has ${Data.pages[currentPage].cookies.length} cookies. Let's count together!`;
      setTimeout(() => {
        textToSpeech2(utterance, () => {
          setActiveCookieId(1);
        });
      }, 1000);
    }
  };

  useEffect(() => {
    if (!spokenRef.current) {
      speakUtterance();
      spokenRef.current = true;
    }
  }, [currentPage]);

  // Reset speech-related state when changing pages
  useEffect(() => {
    setSpokenNumbers(new Set());
    setTranscript('');
    setSttError(null);
    setIsRecording(false);
    chunksRef.current = [];
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream?.getTracks()?.forEach(track => track.stop());
      } catch (e) {
        // ignore if already stopped
      }
    }
  }, [currentPage]);

  useEffect(() => {
    if (!once.current) {
      document.addEventListener('touchstart', (event) => {
        handleInteraction(event, setTouchData);
      });
      once.current = true;
      return () => {
        document.removeEventListener('touchstart', (event) => {
          handleInteraction(event, setTouchData);
        });
      };
    }
  }, []);

  const message = showMessage
    ? `Can Big Bird also have ${Data.pages[currentPage].cookies.length} cookies? Which tray has ${Data.pages[currentPage].cookies.length} cookies? Green or purple?`
    : `Cookie Monster has ${Data.pages[currentPage].cookies.length} cookies. Let's count together!`;

  const moveCircle = (id, currentPage) => {
    setIsWiggling(true);
    setTimeout(() => {
      setIsWiggling(false);
    }, 2000);
    const totalCount = Data.pages[currentPage].cookies.length - 1;
    const numericId = parseInt(id);
    if (cookieCount <= totalCount) {
      if (numericId === activeCookieId) {
        const cookieElement = document.getElementById(id);
        cookieElement.style.pointerEvents = 'none';
        if ("speechSynthesis" in window) {
          const audioElement = new Audio();
          switch (id) {
            case "1":
              audioElement.src = audioData.trills[0];
              break;
            case "2":
              audioElement.src = audioData.trills[1];
              break;
            case "3":
              audioElement.src = audioData.trills[2];
              break;
            case "4":
              audioElement.src = audioData.trills[3];
              break;
            case "5":
              audioElement.src = audioData.trills[4];
              break;
            case "6":
              audioElement.src = audioData.trills[5];
              break;
            case "7":
              audioElement.src = audioData.trills[6];
              break;
            case "8":
              audioElement.src = audioData.trills[7];
              break;
            case "9":
              audioElement.src = audioData.trills[8];
              break;
            case "10":
              audioElement.src = audioData.trills[9];
              break;
            default:
              return;
          }
          audioElement.play();
          if (cookieCount < totalCount) {
            audioElement.onend = setTimeout(() => {
              setCookieCount((prevCount) => prevCount + 1);
              setActiveCookieId(numericId + 1);
            }, 2200);
          }
          if (cookieCount === totalCount) {
            audioElement.onend = setTimeout(() => {
              setCookieCount((prevCount) => prevCount + 1);
            }, 2200);
            const allCookies = document.querySelectorAll('.cookieContainer img');
            allCookies.forEach(cookie => {
              cookie.style.pointerEvents = 'auto';
            });
          }
        } else {
          console.error("SpeechSynthesis API is not supported in this browser.");
        }
      }
    }
    if (cookieCount === totalCount) {
      setActiveCookieId(null);
      setstartAnimation(true);
    }
  };

  const handleNextPage = () => {
    if (currentPage < 3) {
      setCookieCount(0);
      setShowTray2(false);
      setShowBigBird(false);
      setShowMessage(false);
      setActiveCookieId(0);
      setshowGrayArea(false);
      setSelectedTray(null);
      setstartAnimation(false);
      setCookieCount(0);
      clickedCookies.clear();
      spokenRef.current = false;
      spokenRef2.current = false;
      handleNextClickTouchData(touchData, "Touch", currentPage);
      saveAnswers("touchTest");
    }
  };

  // --- Speech to Text handling ---
  const startRecording = async () => {
    try {
      setSttError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        try {
          let recognizedText = '';
          await speechToText(
            blob,
            (text) => {
              recognizedText = text || '';
              setTranscript(recognizedText);
            },
            (err) => setSttError(err)
          );
          // Parse numbers from transcript (digits and words), keep only 1..10
          const wordToNum = {
            one: '1', two: '2', three: '3', four: '4', five: '5',
            six: '6', seven: '7', eight: '8', nine: '9', ten: '10'
          };
          const found = new Set(spokenNumbers);
          const tokens = (recognizedText || '').toLowerCase().split(/[^a-z0-9]+/);
          tokens.forEach(tok => {
            if (!tok) return;
            if (!isNaN(tok)) {
              const num = parseInt(tok, 10);
              if (num >= 1 && num <= 10) found.add(String(num));
            } else if (wordToNum[tok]) {
              found.add(wordToNum[tok]);
            }
          });
          setSpokenNumbers(found);
        } catch (err) {
          console.error('STT parse error:', err);
          setSttError('Could not process speech. Please try again.');
        }
        chunksRef.current = [];
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Mic error:', err);
      setSttError('Microphone access failed. Please allow mic and try again.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 0) {
      setCookieCount(0);
      setShowTray2(false);
      setShowBigBird(false);
      setShowMessage(false);
      setActiveCookieId(0);
      setshowGrayArea(false);
      setSelectedTray(null);
      setstartAnimation(false);
      setCookieCount(0);
      clickedCookies.clear();
      spokenRef.current = false;
      spokenRef2.current = false;
    }
  };

  const setModelshow = () => {
    handleNextClickTouchData(touchData, "Touch", currentPage);
    setModalShow(true);
  };

  const storeAnswer = (answerKey, answerValue) => {
    const storedAnswersJSON = localStorage.getItem('touchTestAnswers');
    const storedAnswersObject = storedAnswersJSON ? JSON.parse(storedAnswersJSON) : {};
    storedAnswersObject[answerKey] = answerValue;
    localStorage.setItem('touchTestAnswers', JSON.stringify(storedAnswersObject));
  };

  const handleTrayClick = (trayType) => {
    setSelectedTray(trayType);
    storeAnswer(currentPage, trayType);
  };

  return (
    <div className="container">
      <div className="row">
        <div className={showGrayArea ? "col-4 cookiecol graybg" : "col-4 cookiecol"}>
          {showGrayArea && <div className="overlay"></div>}
          <div className="background-container">
            <img src={Tray1} alt="tray1" />
          </div>
          <div className="card">
            <div className="card-body">
              {message}
            </div>
          </div>
          <div className="record-controls">
            <button
              className="btn btn-primary me-2"
              onClick={isRecording ? stopRecording : startRecording}
            >
              {isRecording ? 'Stop Speaking' : 'Start Speaking'}
            </button>
            {transcript && (
              <div className="mt-2 small text-muted">
                Transcript: {transcript}
              </div>
            )}
            {sttError && (
              <div className="mt-2 text-danger small">
                {sttError}
              </div>
            )}
          </div>
          <div className="cookieContainer position-absolute">
            {Data.pages[currentPage].cookies.map((cookie) => (
              <img
                key={cookie.id}
                src={cookie.img}
                id={cookie.id}
                className={`${activeCookieId === cookie.id ? "circle" : ""} ${activeCookieId === cookie.id && isWiggling ? "wiggle" : ""} ${spokenNumbers.has(String(cookie.id)) ? "wiggle-glow" : ""}`}
                alt={`Cookie ${cookie.id}`}
                onClick={() => moveCircle(cookie.id.toString(), currentPage)}
                style={{
                  position: "absolute",
                  top: cookie.top,
                  left: cookie.left,
                }}
              />
            ))}
          </div>
          {startAnimation && (
            <div className="anim">
              <Animation onAnimationFinish={handleAnimationFinish} />
            </div>
          )}
        </div>
        <div className="col-8 position-absolute tray-container">
          {showTray2 && (
            <div>
              <div
                className={`tray-overlay1 ${selectedTray === "greenTray" ? "glow1" : ""}`}
                onClick={() => handleTrayClick("greenTray")}
              />
              <img
                src={greenTray}
                alt="greentray"
                className="tray2"
                id="greenTray"
                key="greenTray"
              />
              <div className="greenBiscuits position-absolute">
                {Data.pages[currentPage].greenTray[0].biscuits.map((biscuit) => (
                  <img
                    key={biscuit.id}
                    src={biscuit.img}
                    id={biscuit.id}
                    className="biscuits"
                    alt=""
                    style={{
                      position: "absolute",
                      top: biscuit.top,
                      left: biscuit.left,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          {showTray2 && (
            <div>
              <div
                className={`tray-overlay2 ${selectedTray === "purpleTray" ? "glow2" : ""}`}
                onClick={() => handleTrayClick("purpleTray")}
              />
              <img
                src={purpleTray}
                className="tray3"
                id="purpleTray"
                key="purpleTray"
                alt="purpletray"
              />
              <div className="greenBiscuits position-absolute">
                {Data.pages[currentPage].purpleTray[0].biscuits.map((biscuit) => (
                  <img
                    key={biscuit.id}
                    src={biscuit.img}
                    id={biscuit.id}
                    className="biscuits"
                    alt=""
                    style={{
                      position: "absolute",
                      top: biscuit.top,
                      left: biscuit.left,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          {showBigBird && (
            <img src={BigBird} className="bigBird" id="bigBird" key="bigBird" alt="bigbird" />
          )}
        </div>
        <div className="buttons">
          {currentPage > 0 ? (
            <button onClick={handlePreviousPage}>
              <Link to={`/game/touch2/play/${currentPage - 1}`}>
                <ArrowBackIosIcon />
              </Link>
            </button>
          ) : (
            <button disabled>
              <ArrowBackIosIcon />
            </button>
          )}
          {currentPage < 3 ? (
            <button onClick={handleNextPage}>
              <Link to={`/game/touch2/play/${currentPage + 1}`}>
                <ArrowForwardIosIcon />
              </Link>
            </button>
          ) : (
            <button onClick={setModelshow}>
              <ArrowForwardIosIcon />
            </button>
          )}
          <DialogBox show={modalShow} onHide={() => setModalShow(false)} page="practice" />
        </div>
        <div>
          <button className="homeLogo">
            <Link to={`/game/home/${selectedOption}`}>
              <HomeRoundedIcon />
            </Link>
          </button>
        </div>
      </div>
    </div>
  );
};

export default GamePage2;
