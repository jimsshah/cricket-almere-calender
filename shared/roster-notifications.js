export function isConfirmedPlayer(orderedPlayers, uid, limit = 18) {
  const position = orderedPlayers.findIndex((player) => player.uid === uid);
  return position >= 0 && position < limit;
}

export function getPromotedPlayer(orderedPlayers, removedPlayerId, limit = 18) {
  const removedPosition = orderedPlayers.findIndex((player) => player.id === removedPlayerId);
  if (removedPosition < 0 || removedPosition >= limit) return null;
  return orderedPlayers[limit] || null;
}

export function shouldNotifyPaymentLinkOpened(previousLink, nextLink) {
  return !previousLink && Boolean(nextLink);
}