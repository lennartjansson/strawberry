import React, {useState} from 'react';
import {StartingPhase} from './gameState';
import {PlayerWithCardsInHand} from './Cards';
import {LETTERS} from './gameLogic';
import {useJoinRoom} from './gameHook';

function StartGameRoom({room, username, startingGameState, stateVersion}: {room: string, username: string, startingGameState: StartingPhase, stateVersion: number}) {
    const joinStatus = useJoinRoom(room, startingGameState, stateVersion, username);
    return <div className='gameContainer'>
        <StartGameRoomSidebar username={username} startingGameState={startingGameState} />
        <div className='flexCenterContainer'>
            <StartGameRoomMain username={username} startingGameState={startingGameState} />
        </div>
    </div>;
}

function StartGameRoomSidebar({username, startingGameState}: {username: string, startingGameState: StartingPhase}) {
    return <div className='gameSidebar'>
        {startingGameState.players.map((player, i) => {
            // For sizing purposes, we render an invisible dummy hand if the player has not yet submitted a word
            const shouldHideHand = !player.word;
            const hand = {
                // letters themselves not currently rendered, but might be later?
                letters: player.word ? player.word.split('') : Array.from({length: startingGameState.wordLength}, () => {return '🍓'}),
                activeIndex: -1, // useless here, idk
            };
            const playerNumber = i + 1;
            return <PlayerWithCardsInHand
                hand={hand}
                shouldHideHand={shouldHideHand}
                isForViewingPlayer={player.name === username}
                playerName={player.name}
                playerNumber={playerNumber}
                key={playerNumber}
            />
        })}
    </div>
}

function StartGameRoomMain({username, startingGameState}: {username: string, startingGameState: StartingPhase}) {
    const [inputWord, setInputWord] = useState('');
    const [errorToRender, setErrorToRender] = useState('');

    const filteredPlayers = startingGameState.players.filter(player => player.name === username);
    const playerIfExists = filteredPlayers.length !== 0 && filteredPlayers[0];
    const isSpectator = !playerIfExists;

    const playerNeedsToInputWord = playerIfExists && playerIfExists.word === null;
    const isGameReady = startingGameState.players.every(player => player.word !== null);



    let isInputWordValid = false;
    // note: we don't always render this (only rendered after a submit until next keystroke), but compute it here
    // instead of in form onSubmit to not duplicate logic
    let errorMessage = '';
    if (inputWord.length !== startingGameState.wordLength) {
        const wordLengthDiff = startingGameState.wordLength - inputWord.length;
        const absDiff = Math.abs(wordLengthDiff);
        errorMessage = `Try ${absDiff} ${wordLengthDiff > 0 ? 'more': 'less'} letter${absDiff === 1 ? '' : 's'}`;
    } else if (!/^[a-zA-Z]+$/.test(inputWord)) {
        errorMessage = "Letters only, please!"
    } else if (inputWord.split('').some(letter => !LETTERS.includes(letter.toUpperCase()))) {
        errorMessage = "J, Q, V, X and Z aren't allowed, sorry";
    } else {
        isInputWordValid = true;
    }

    if (playerNeedsToInputWord) {
        return <div className='gameStartMainContent'>
            📝 Enter your {startingGameState.wordLength} letter word
            <form onSubmit={e => {
                e.preventDefault();
                if (isInputWordValid) {
                    // TODO
                } else {
                    setErrorToRender(errorMessage);
                }
            }}>
                <input
                    className='strawberryInput'
                    value={inputWord}
                    style={{
                        // hack so it only turns green when valid
                        borderColor: isInputWordValid ? '#19AF00' : '#D20B0B',
                    }}
                    onChange={e => {
                        setInputWord(e.target.value);
                        setErrorToRender('');
                    }}
                />
            </form>
            <div className='gameStartWordErrorMessage'>{errorToRender}</div>
        </div>;
    }

    if (isGameReady) {
        if (isSpectator) {
            return <div className='bigText'>🕐 Waiting for game to start...</div>
        } else {
            return <div className='strawberryButton' onClick={() => {
                // TODO
            }}>Start game</div>
        }
    }

    // TODO: allow editing a word here for player
    return <div className='bigText'>🕐 Waiting for players to enter words...</div>
}

export {StartGameRoom};