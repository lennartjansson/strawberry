import React, {useContext, useEffect, useState, useRef} from 'react';
import ScrollableFeed from 'react-scrollable-feed';
import {
    Dummy,
    HintingPhasePlayer,
    isProposing,
    isResolving,
    ProposingHintPhase, ResolveAction,
    ResolveActionKind,
    ResolvingHintPhase,
    StartedPhase,
    RoomPhase,
    EndgamePhase,
    StartedPlayer,
    EndgameLetterChoice,
    EndgamePhasePlayer,
} from './gameState';
import {Hint, Letter, LetterAndSource, LetterSources, PlayerNumber} from './gameTypes';
import {PlayerNameContext, useGiveHint, usePlayerContext, useProposeHint, useResolveHint, useSetHandGuess, useStrawberryGame, useSetFinalGuess, useCommitFinalGuess} from './gameHook';
import {
    Card,
    CardsFromLettersAndSources,
    CardsInHint,
    CardWithAnnotation,
    CardWithPlayerNumberOrLetter,
    DisplayNumberOrLetterWithTextAndCards,
    PlayerWithCardsInHand,
    CardsInHand,
    RevealedCardsInHand
} from './Cards';
import {ResolveActionChoice, specsOfHint, whichResolveActionRequired, playersWithOutstandingAction, LETTERS, availableLetters, moveToEndgame, setFinalGuess} from './gameLogic';
import {deepEqual} from './utils';
import { LinkButton } from './LinkButton';

function StartedGameRoom({gameState}: {gameState: StartedPhase}) {
    const {isSpectator, playerNumber} = usePlayerContext();
    let action: React.ReactNode;
    if (isSpectator) {
        // Spectators can't act.
    } else if (gameState.phase === RoomPhase.HINT) {
        const activeHintNumber = gameState.hintLog.length + 1;
        const totalHintsAvailable = gameState.hintLog.length + gameState.hintsRemaining;
        action = <div className="hintLogEntry">
            <div className='hintLogTitle'>Hint {activeHintNumber} / {totalHintsAvailable}</div>
            {isProposing(gameState) && <ProposingHintComponent hintingGameState={gameState} />}
            {isResolving(gameState) && <ResolvingHintComponent hintingGameState={gameState} />}
        </div>;
    } else if (!gameState.players[playerNumber! - 1].committed) {
        action = <div className="hintLogEntry">
            <div className='hintLogTitle'>Construct your word</div>
            <GuessWordComponent gameState={gameState} />
        </div>
    }

    return <div className='gameContainer'>
        <StartedGameRoomSidebar gameState={gameState} />
        <StartedGameRoomLog gameState={gameState}>
            {action}
        </StartedGameRoomLog>
        {!isSpectator && <StartedGameRoomNotesSidebar />}
    </div>;
}

function StartedGameRoomSidebar({gameState}: {gameState: StartedPhase}) {
    const username = useContext(PlayerNameContext);
    const [settingGuesses, setGuess] = useSetHandGuess(gameState);
    const players: readonly StartedPlayer[] = gameState.players;
    return <div className='gameSidebar gameSidebarPlayers'>
        {players.map((player, i) => {
            const playerNumber = i + 1;
            const isForViewingPlayer = player.name === username;
            const hand = {...player.hand};
            if (isForViewingPlayer) {
                hand.guesses = Array.from(
                    // TODO: remove this migration
                    player.hand.guesses || {length: gameState.wordLength},
                    // overlay `settingGuesses` on top
                    (v, i) => settingGuesses ? settingGuesses[i] ?? v : v,
                );
            }
            let cardsToRender = <CardsInHand hand={hand} isForViewingPlayer={isForViewingPlayer} setGuess={isForViewingPlayer ? setGuess : undefined} />;

            if (gameState.phase === RoomPhase.ENDGAME) {
                const p = player as EndgamePhasePlayer;
                // All letters are guessable, but no letter is revealed.
                hand.activeIndex = gameState.wordLength;
                let override: (LetterAndSource | null)[] | undefined;
                const convert = (choice: EndgameLetterChoice): LetterAndSource => {
                    if (choice.sourceType === LetterSources.PLAYER) {
                        return {
                            sourceType: LetterSources.PLAYER,
                            letter: gameState.players[playerNumber-1].hand.letters[choice.index],
                            playerNumber,
                        };
                    }
                    return choice;
                }
                if (p.committed) {
                    // Reveal this player's final guess!
                    override = p.guess.map(convert);
                } else if (!isForViewingPlayer) {
                    // Show the letters that this player has taken from the centre.
                    override = p.guess.filter((choice) => choice.sourceType !== LetterSources.PLAYER).map(convert);
                    while (override.length < gameState.wordLength) {
                        override.push(null);
                    }
                }
                if (override) {
                    cardsToRender = <RevealedCardsInHand letters={override} />;
                }
            }
            return <PlayerWithCardsInHand
                cardsToRender={cardsToRender}
                isForViewingPlayer={isForViewingPlayer}
                playerName={player.name}
                playerNumber={playerNumber}
                key={playerNumber}
                extraText={`${player.hintsGiven} hint${player.hintsGiven === 1 ? '' : 's'} given`}
            />
        })}
        {gameState.dummies.length > 0 && <DummiesSection dummies={gameState.dummies} />}
        {gameState.bonuses.length > 0 && <BonusesSection bonuses={gameState.bonuses} />}
    </div>
}

let debounceTimeout: null | number = null;
function StartedGameRoomNotesSidebar() {
    // TODO: refactor local storage keys into constants
    // TODO: separate into components
    // TODO: save sidebar width to localStorage
    const [sidebarWidth, setSidebarWidth] = useState(350);
    const [notes, setNotes] = useState('');
    const strawberryGame = useStrawberryGame();
    const roomName = strawberryGame?.roomName!;
    const localStorageKey = `notes:${roomName}`;
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Load the notes from local storage in case user rejoined
    useEffect(() => {
        const existingNotes = localStorage.getItem(localStorageKey);
        if (existingNotes !== null) {
            setNotes(existingNotes);
        }
    }, []);

    const [isDragging, setIsDragging] = useState(false);
    const handleRef = useRef<HTMLDivElement>(null);

    return <>
        <div className='gameSidebar gameSidebarNotesHandle'
             onPointerDown={e => {
                 handleRef!.current!.setPointerCapture(e.pointerId);
                 setIsDragging(true)
             }}
             onMouseMove={e => {
                 if (isDragging) {
                     // minus 10 due to width of handle
                     let newWidth = window.innerWidth - e.pageX - 10;
                     if (newWidth < 100) newWidth = 100;
                     setSidebarWidth(newWidth);
                 }
             }}
             onPointerUp={e => {
                 handleRef!.current!.releasePointerCapture(e.pointerId);
                 setIsDragging(false)
             }}
             ref={handleRef}
        />
        <div className='gameSidebar gameSidebarNotes' style={{width: `${sidebarWidth}px`, position: 'relative'}}>
            <textarea
                className='notesBox'
                value={notes}
                placeholder='You can type notes here'
                onChange={e => {
                    const newValue = e.target.value;
                    if (debounceTimeout !== null) {
                        clearTimeout(debounceTimeout);
                    }
                    debounceTimeout = window.setTimeout(() => {localStorage.setItem(localStorageKey, newValue)}, 1000);
                    setNotes(e.target.value);
                }}
                ref={textareaRef}
                onKeyDown={e => {
                    // tab to insert space https://jsfiddle.net/2wAzx/13/
                   if (e.keyCode === 9) {
                       e.preventDefault();
                       const textarea = textareaRef.current;
                       if (!textarea) return;

                       // get caret position/selection
                       const val = textarea.value;
                       const start = textarea.selectionStart;
                       const end = textarea.selectionEnd;

                       // set textarea value to: text before caret + spaces + text after caret
                       textarea.value = val.substring(0, start) + '    ' + val.substring(end);

                       // put caret at right position again
                       textarea.selectionStart = textarea.selectionEnd = start + 4;

                       // prevent the focus lose
                       return false;
                   }
                }}
            />
        </div>
    </>
}

function DummiesSection({dummies}: {dummies: readonly Dummy[]}) {
    const cards = <div className='flex'>
        {dummies.map((dummy, i) => {
            const annotation = <span className='dummyAnnotation strawberryCenter'>{dummy.untilFreeHint > 0 ? `${dummy.untilFreeHint} to hint` : ''}</span>;
            return <CardWithAnnotation letter={dummy.currentLetter} annotation={annotation} key={i} />
        })}
    </div>;
    return <DisplayNumberOrLetterWithTextAndCards
        numberOrLetter='D'
        topText='Dummies'
        cardsToRender={cards}
    />
}

function BonusesSection({bonuses}: {bonuses: readonly Letter[]}) {
    const cards = <div className='flex'>
        {bonuses.map((letter, i) => {
            return <Card letter={letter} key={i} />
        })}
    </div>;
    return <DisplayNumberOrLetterWithTextAndCards
        numberOrLetter='B'
        topText='Bonuses'
        cardsToRender={cards}
    />
}

function StartedGameRoomLog({gameState, children}: {gameState: StartedPhase, children: React.ReactNode}) {
    const {playerNumber} = usePlayerContext();

    return <ScrollableFeed className='hintLogContainer'>
        <div className='hintLogContent'>
            {gameState.hintLog.map((logEntry, i) => {
                const wasViewingPlayerInHint = playerNumber !== null && logEntry.hint.lettersAndSources.some(letterAndSource => {
                    return letterAndSource.sourceType === LetterSources.PLAYER && letterAndSource.playerNumber === playerNumber;
                });
                const playerCardUsed = wasViewingPlayerInHint ? logEntry.activeIndexes[playerNumber! - 1] : null;
                return <div className="hintLogEntry" key={i}>
                    <div className='hintLogTitle' key={i}>Hint {i + 1} / {logEntry.totalHints}</div>
                    <HintInLog
                        hint={logEntry.hint}
                        playerActions={logEntry.playerActions}
                        playerCardUsed={playerCardUsed}
                        players={gameState.players}
                    />
                </div>
            })}
            {children}
        </div>
    </ScrollableFeed>
}

function plural(n: number): string {
    return n === 1 ? '' : 's';
}

function getHintSentence(hint: Hint): string {
    const specs = specsOfHint(hint);

    let sentence = `${specs.length} letter${plural(specs.length)}, ${specs.players} player${plural(specs.players)}, ${specs.wildcard ? '' : 'no '}wildcard`;

    if (specs.dummies > 0) {
        sentence += `, ${specs.dummies} ${specs.dummies === 1 ? 'dummy' : 'dummies'}`;
    }
    if (specs.bonuses > 0) {
        sentence += `, ${specs.bonuses} ${specs.bonuses === 1 ? 'bonus' : 'bonuses'}`;
    }

    return sentence ;
}


function ProposingHintComponent({hintingGameState}: {hintingGameState: ProposingHintPhase}) {
    const {isSpectator} = usePlayerContext();

    return <>
        <div className='hintLogLine'>Players are proposing hints.</div>
        {hintingGameState.players.map((player, i) => {
            const proposedHint = hintingGameState.activeHint.proposedHints[i + 1];
            const sentence = proposedHint && getHintSentence(proposedHint);
            return <div className='hintLogLine' key={i}>
                <PlayerName name={player.name} /> <span className="has">has</span> {proposedHint ? `proposed: ${sentence}.` : 'not proposed a hint.'}
            </div>;
        })}
        {!isSpectator && <HintComposer hintingGameState={hintingGameState} />}
    </>;
}

function addLetterAndSourceToHint(hint: Hint | null, letterAndSource: LetterAndSource, playerNumber: PlayerNumber): Hint {
    // First letter
    if (hint === null) {
        return {
            givenByPlayer: playerNumber,
            lettersAndSources: [letterAndSource],
        }
    }
    return {
        givenByPlayer: hint.givenByPlayer,
        lettersAndSources: [...hint.lettersAndSources, letterAndSource],
    }
}

function removeLetterFromHintByIndex(hint: Hint, i: number): Hint | null {
    if (hint.lettersAndSources.length === 1) {
        return null;
    }

    const newLettersAndSources = [...hint.lettersAndSources];
    newLettersAndSources.splice(i, 1);

    return {
        givenByPlayer: hint.givenByPlayer,
        lettersAndSources: newLettersAndSources,
    }
}

function HintComposer({hintingGameState}: {hintingGameState: ProposingHintPhase}) {
    const {playerNumber} = usePlayerContext();
    const proposedHint: Hint | null = hintingGameState.activeHint.proposedHints[playerNumber!] || null;

    const [stagedHint, setStagedHint] = useState<Hint | null>(proposedHint);

    const [nextProposedHint, callProposeHint] = useProposeHint(hintingGameState);
    const callSubmitHint = useGiveHint(hintingGameState);

    const stagedHintSentence = stagedHint !== null && getHintSentence(stagedHint);

    const proposedWord = proposedHint && proposedHint.lettersAndSources.map(letterAndSource => letterAndSource.letter).join('').toUpperCase();
    let proposeText = 'Propose hint';
    if (proposedWord) {
        proposeText += ` (current: ${proposedWord})`;
    }

    const canSubmitHint = stagedHint != null && deepEqual(stagedHint, proposedHint) && nextProposedHint === undefined;

    const addToStagedHint = (letterAndSource: LetterAndSource) => {
        const newHint = addLetterAndSourceToHint(stagedHint, letterAndSource, playerNumber!);
        setStagedHint(newHint);

        if (newHint.lettersAndSources.length === 11) {
            const isUserAlreadyWarned = localStorage.getItem('longHintWarning');
            if (isUserAlreadyWarned === null) {
                alert('ok stop :^)');
                localStorage.setItem('longHintWarning', 'true');
            }
        }
    };

    const submit = () => {
        if (stagedHint != null
            && canSubmitHint
            && callSubmitHint != null) {
            callSubmitHint(stagedHint);
            setStagedHint(null);
        }
    };

    const removeLetterFromHint = (letterAndSource: LetterAndSource, i: number) => {
       const newHint = removeLetterFromHintByIndex(stagedHint!, i);
       setStagedHint(newHint);
    };

    return <>
        <div className='hintLogLine' />
        <div className='hintLogLine italics'>Available letters (click to use): </div>
        <AvailableCards
            hintingGameState={hintingGameState}
            playerNumber={playerNumber!}
            addToStagedHint={addToStagedHint}
        />
        <div className='hintLogGuessBox'>
            {<CardsInHint lettersAndSources={stagedHint?.lettersAndSources ?? []} viewingPlayer={playerNumber!} onClick={removeLetterFromHint} />}
            <div className='flexAlignRight hintLogGuessBoxClear'>
                <LinkButton onClick={() => {
                    setStagedHint(null);
                }} isDisabled={stagedHint === null}>Clear</LinkButton>
            </div>
        </div>
        <div className='flex hintLogLine'>
            {stagedHint !== null && <span className='italics'>{stagedHintSentence}</span>}
            <span className='flexAlignRight'>
                <LinkButton isDisabled={stagedHint == null && callProposeHint != null} onClick={() => stagedHint != null && callProposeHint != null && callProposeHint(stagedHint)}>{proposeText}</LinkButton>
                <span style={{marginLeft: '10px'}} />
                <LinkButton isDisabled={!canSubmitHint} onClick={submit}>Submit hint</LinkButton>
            </span>
        </div>
    </>
}

function AvailableCards({hintingGameState, playerNumber, addToStagedHint}: {
    hintingGameState: ProposingHintPhase,
    playerNumber: PlayerNumber,
    addToStagedHint: (letterAndSource: LetterAndSource) => void,
}) {
    let lettersAndSources: LetterAndSource[] = [];

    hintingGameState.players.forEach((player, i) => {
        if (i + 1 !== playerNumber) {
            lettersAndSources.push({
                sourceType: LetterSources.PLAYER,
                letter: player.hand.letters[player.hand.activeIndex],
                playerNumber: i + 1,
            });
        }
    });

    lettersAndSources.push({
        sourceType: LetterSources.WILDCARD,
        letter: '*',
    });

    hintingGameState.dummies.forEach((dummy, i) => {
        lettersAndSources.push({
            sourceType: LetterSources.DUMMY,
            letter: dummy.currentLetter,
            dummyNumber: i + 1,
        });
    });

    hintingGameState.bonuses.forEach(bonus => {
        lettersAndSources.push({
            sourceType: LetterSources.BONUS,
            letter: bonus,
        })
    });

    return <div className='hintLogLine' style={{marginLeft: '12px'}}>
        <CardsFromLettersAndSources lettersAndSources={lettersAndSources} viewingPlayer={playerNumber} onClick={addToStagedHint} />
    </div>
}

function PlayerName({name}: {name: string}) {
    const {username} = usePlayerContext();
    return <>
        <span className="playerName">{name}</span>
        {username === name && <> <span className="you">(you)</span></>}
    </>;
}

function HintInLog({hint, playerActions, playerCardUsed, players}: {
    hint: Hint,
    playerActions: readonly ResolveAction[],
    playerCardUsed: null | number,
    players: readonly HintingPhasePlayer[],
}) {
    const {playerNumber} = usePlayerContext();

    let playerNamesByNumber: Record<PlayerNumber, string> = {};
    players.forEach((player, i) => {
        playerNamesByNumber[i + 1] = player.name;
    });

    let playerActionStrings = playerActions.map(playerAction => {
        const actingPlayerName = playerNamesByNumber[playerAction.player];

        switch (playerAction.kind) {
            case ResolveActionKind.NONE:
                return <><PlayerName name={actingPlayerName} /> <span className="incorrect">did not flip</span> <span className="their">their</span> card.</>;
            case ResolveActionKind.FLIP:
                return <><PlayerName name={actingPlayerName} /> <span className="correct">flipped</span> <span className="their">their</span> card.</>;
            case ResolveActionKind.GUESS:
                if (playerAction.actual === playerAction.guess) {
                    return <><PlayerName name={actingPlayerName} /> <span className="correct">correctly</span> guessed {playerAction.actual}.</>;
                }
                return <><PlayerName name={actingPlayerName} /> <span className="incorrect">incorrectly</span> guessed {playerAction.guess} (actual: {playerAction.actual}).</>;
            default:
                return '';
        }
    });

    // TODO: marginLeft -12 if want to align cards with hint construction
    return <>
        <div className='hintLogLine'><PlayerName name={playerNamesByNumber[hint.givenByPlayer]} /> gave a hint: {getHintSentence(hint)}</div>
        <div className='hintLogLine' style={{marginLeft: '-5px'}}>
            <CardsInHint lettersAndSources={hint.lettersAndSources} viewingPlayer={playerNumber!} />
        </div>
        {playerCardUsed !== null && <div className='hintLogLine'>Your position {playerCardUsed + 1} card was used.</div>}

        {playerActionStrings.map((str, i) => {
            return <div className='hintLogLine' key={i}>{str}</div>;
        })}
    </>;
}

function ResolvingHintComponent({hintingGameState}: {hintingGameState: ResolvingHintPhase}) {
    const {username, player, playerNumber} = usePlayerContext();

    const activeHint = hintingGameState.activeHint;

    const resolveActionRequired = whichResolveActionRequired(hintingGameState, username);
    // Compute whether a card of the player's was used (based on activeIndex and whether they flipped) to render.
    const isPlayerCardUsedInHint = resolveActionRequired !== ResolveActionChoice.UNINVOLVED;
    const playerCardUsed = isPlayerCardUsedInHint ? hintingGameState.activeHint.activeIndexes[playerNumber! - 1] : null;

    const waitingOnPlayers = playersWithOutstandingAction(hintingGameState.activeHint);
    const waitingOnPlayerNames = hintingGameState.players.filter((player, i) => waitingOnPlayers.has(i+1)).map((player) => player.name);

    return <>
        <HintInLog hint={activeHint.hint} playerActions={activeHint.playerActions} playerCardUsed={playerCardUsed} players={hintingGameState.players} />
        <div className='hintLogLine flex'>
            {resolveActionRequired === ResolveActionChoice.FLIP && <FlipResolve playerNumber={playerNumber!} hintingGameState={hintingGameState} />}
            {resolveActionRequired === ResolveActionChoice.GUESS && <GuessResolve player={player!} playerNumber={playerNumber!} hintingGameState={hintingGameState} />}
            {waitingOnPlayerNames.length > 0 && <span className='flexAlignRight italics'>Waiting on: {waitingOnPlayerNames.join(', ')}</span>}
        </div>
    </>;
}

function FlipResolve({playerNumber, hintingGameState}: {playerNumber: PlayerNumber, hintingGameState: ResolvingHintPhase}) {
    const resolveFn = useResolveHint(hintingGameState);
    if (resolveFn === null) throw new Error('illegal');
    return <>
        <span className='italics'>Would you like to flip your card?&nbsp;</span>
        <LinkButton onClick={() => {
            resolveFn({
                player: playerNumber,
                kind: ResolveActionKind.FLIP,
            });
        }}>Yes</LinkButton>
        &nbsp;/&nbsp;
        <LinkButton onClick={() => {
            resolveFn({
                player: playerNumber,
                kind: ResolveActionKind.NONE,
            });
        }}>No</LinkButton></>;
}

function GuessResolve({player, playerNumber, hintingGameState}: {player: HintingPhasePlayer, playerNumber: PlayerNumber, hintingGameState: ResolvingHintPhase}) {
    const [guess, setGuess] = useState('');
    const resolveFn = useResolveHint(hintingGameState);
    if (resolveFn === null) throw new Error('illegal');
    return <>
        <span className='italics'>Guess the value of your bonus card: </span>
        <form onSubmit={e => {
            e.preventDefault();
            if (guess !== '') {
                if (guess.length !== 1) throw new Error('how did you guess more than one letter');
                resolveFn({
                    player: playerNumber,
                    kind: ResolveActionKind.GUESS,
                    guess,
                    actual: player.hand.letters[player.hand.activeIndex],
                });
            }
        }}>
            <input
                className='strawberryInput strawberryInputSmall'
                value={guess}
                onChange={(e) => {
                    const letter = e.target.value.substr(e.target.value.length - 1, 1).toUpperCase();
                    setGuess(LETTERS.includes(letter) ? letter : '');
                }}
                autoFocus
            />
        </form>
    </>;
}

function GuessWordComponent({gameState}: {gameState: EndgamePhase}) {
    const {player, playerNumber} = usePlayerContext();
    if (player == null || playerNumber == null) throw new Error("no");

    const [settingGuess, setGuess] = useSetFinalGuess(gameState);
    const guess = settingGuess ?? gameState.players[playerNumber-1].guess;

    const optimisticGameState = settingGuess
    ? setFinalGuess(gameState, playerNumber, settingGuess) ?? gameState
    : gameState;

    const available = availableLetters(optimisticGameState, playerNumber);
    const convert = (choice: EndgameLetterChoice): LetterAndSource => {
        if (choice.sourceType === LetterSources.PLAYER) {
            return {
                sourceType: LetterSources.PLAYER,
                letter: gameState.players[playerNumber-1].hand.guesses[choice.index] ?? '?',
                playerNumber,
            };
        }
        return choice;
    };
    const lettersAndSources: LetterAndSource[] = available.map(convert);

    const addToGuess = (_: object, i: number) => {
        setGuess([...guess, available[i]]);
    };
    const removeLetterFromGuess = (_: object, i: number) => {
        let newGuess = [...guess];
        newGuess.splice(i, 1);
        setGuess(newGuess);
    };

    const canSubmitGuess = !settingGuess && guess.length >= gameState.wordLength;
    const submit = useCommitFinalGuess(gameState);

    return <>
        <div className='hintLogLine' style={{marginLeft: '12px'}}>
            <CardsFromLettersAndSources lettersAndSources={lettersAndSources} viewingPlayer={-1} onClick={addToGuess} />
        </div>
        <div className='hintLogGuessBox'>
            <CardsInHint lettersAndSources={guess.map(convert)} viewingPlayer={-1} onClick={removeLetterFromGuess} />
            <div className='flexAlignRight hintLogGuessBoxClear'>
                <LinkButton onClick={() => {
                    setGuess([]);
                }} isDisabled={guess.length === 0}>Clear</LinkButton>
            </div>
        </div>
        <div className='flex hintLogLine'>
            <span className='flexAlignRight'>
                <LinkButton isDisabled={!canSubmitGuess} onClick={submit}>Submit guess</LinkButton>
            </span>
        </div>
    </>
}

export { StartedGameRoom };