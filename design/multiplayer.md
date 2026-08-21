---
type: design
category: gameplay-systems
status: unbuilt
resolution: sharp
related: [campaign-pacing, missions, game-balance]
---

# Multiplayer

Two players, two bases, one world. What each player controls, what they share,
and what they compete over.

## The seven decisions

| | Decision |
|---|---|
| 1 | The world holds one set of leads; each player sees a portion of it |
| 2 | The doom clock is shared, and its expiry loses the campaign for both |
| 3 | The day advances only when both players declare ready |
| 4 | A player's mission choice is private |
| 5 | Two players who deploy to the same lead play it together, on one level |
| 6 | Nothing makes a mission require two squads except its difficulty |
| 7 | Rewards inside a mission go to whoever reaches them first |

## Why

Cooperation and competition are both live at every moment. Players compete for
leads, for rewards on the ground, and for a shared clock's remaining time; they
cooperate because some work is too hard to survive alone and because losing is
collective. Neither impulse is ever switched off, and no mechanic forces either
one.

## What the player experiences

| | |
|---|---|
| The other player is a rumour | You see your own portion of the board and your own base. What they are doing is what they tell you |
| Agreement happens outside the game | There is no negotiation interface. Teaming up is arranged by talking, then confirmed by both deploying to the same lead |
| Time only moves when both agree | Neither player can advance the campaign alone |
| Their failure costs you | The doom clock is one number, and a wiped squad advances it against both of you |
| Help is never free | A partner on your mission is a second squad's worth of firepower and a second squad taking the rewards off the floor |

## The board

| | |
|---|---|
| One world set | Leads are generated once for the world, not once per player |
| Partial visibility | Each player sees a portion of the set. Neither sees all of it |
| Sharing | A player can disclose a lead to the other, making it visible and deployable for them |
| Everything else | Arrival, expiry, the ceiling, and the thin-board rule are unchanged from `campaign-pacing.md` |

Partial visibility is what makes a lead worth telling someone about. A shared
lead is a favour with a cost, because the other player may take it.

## The day

| | |
|---|---|
| Unit | The day, unchanged |
| Advance | Both players declare ready. The day advances once |
| Cost of a deploy | One day, whoever deployed. Two simultaneous deploys still cost one day |
| The non-deploying player | Spends the same day at base |
| Idling | A player with nothing to do declares ready and the day passes for both |

A day is spent by both players whether or not both acted, so a player who
deploys every day is spending the same campaign time as one who never does.

## Deploying

| | |
|---|---|
| Privacy | Neither player sees the other's choice, and there is no way to tell them |
| Commitment | Once both are ready, choices are locked. There is no withdrawal |
| Start | Both missions begin at the same moment |
| Coincidence counts | Two players who arrive at the same lead play it together whether or not they planned to |

Teaming up and colliding are the same input. A player who takes a lead expecting
to be alone, and finds the other player there, is in a joint mission.

## What each player knows

| | |
|---|---|
| Their board | Nothing. A lead you cannot see leaves no gap where it would have been, so you do not know how much of the world you are missing |
| Their base | Nothing. Credits, roster, armoury and fabrication are invisible |
| Their readiness | Whether they have declared ready, and nothing about what they declared it for |
| Their squad | Visible only on a level you are both standing on |
| After a mission | Which lead they took. Nothing else |
| Never disclosed | Whether they succeeded, who died, and what they recovered |

The doom clock is shared, so its movement is visible whatever caused it. Nothing
explains the cause.

## Joint missions

| | |
|---|---|
| One level | Both squads deploy onto the same generated level |
| No gate | Any lead can be taken by one player alone, including the ones built for two |
| Difficulty is the only pressure | A mission wants two squads because one squad is likely to die on it, not because the game refuses to let one in |
| Finishing | A squad's mission ends when it reaches the end of the level, and that squad leaves |
| Independent ends | Each squad finishes on its own. One leaving does not end the level for the other |
| No early exit | Leaving is not an action a player takes. Reaching the end is the only way out |
| Friendly fire | A toggle, off by default |

A squad that reaches the end first leaves the rest of the level to the other
player, at whatever strength it has left.

## Rewards

| | |
|---|---|
| Nothing is split | A mission pays in what each squad carries out of the level. There is no shared purse and no agreed division |
| On the ground | Items recovered inside the level go to whoever reaches them first |
| Contested by default | Every pickup in a joint mission is a race |
| Indivisible rewards | Some missions pay in a single object that cannot be split |

An indivisible reward is the case where two players who cooperated to clear a
mission end it with something only one of them can hold.

## Death

| | |
|---|---|
| Permadeath is unchanged | Soldiers who die are gone, on joint missions as on solo ones |
| Both rosters are at risk | Either player's soldiers can die on a shared level |
| No attribution | The game does not record or report whose decision killed whom |

## Losing and winning

| | |
|---|---|
| The clock | One doom clock for the world. Reaching zero loses the campaign for both players |
| One player can lose it for both | A squad wiped on work it could not handle costs campaign health that both players pay |
| The finale | Appears for the player who earns it, by the gate in `campaign-pacing.md` |
| Sharing the finale | The player who has it may disclose it, the same way any lead is disclosed. It does not appear for the other player on its own |
| Winning alone | A player who clears the finale alone wins, and the campaign ends |
| The other player | Ends without a win and without a defeat |

Victory is individual and defeat is collective.

## Interruption

| | |
|---|---|
| A player who leaves mid-mission | Their squad is handed to the AI and fights on as companions of the remaining player |
| Their soldiers | Remain subject to permadeath while under AI control |

## Not in this design

Named so they read as absent rather than overlooked.

| | |
|---|---|
| More than two players | |
| Joint research and joint financing | |
| Mechanical differences between the players' nations | |
| Rewards that are not first-to-reach | Every pickup is contested. A later design makes most rewards non-pickup and leaves pickups uncommon |
| A mission-length constraint | Generated missions vary in length, so one player routinely finishes well before the other |
| Anything for the player who finishes first | They return to base and wait |
| Trading, lending, or gifting between bases | Sharing a lead is the only thing one player can give another |
| Telling the other player where you are going | A mission choice is private, full stop. There is no control for announcing one and no place one would appear |
| A communication channel | Players talk outside the game. A later design gives them one inside it, and at that point they share whatever information they like — including their mission choice, in words the game does not model |
| A split of mission credits | Missions do not pay credits. What a squad carries out of the level is what that player keeps, and selling it at base is a private transaction |
