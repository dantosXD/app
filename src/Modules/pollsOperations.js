import firebase from "./firebaseApp";
import _ from "lodash";

export const POLLS_STATES = {
  DRAFT: "draft",
  PUBLISHED: "published",
  TERMINATED: "terminated"
};

export const POLLS_NAMESPACES = {
  GLOBAL: "global"
};

export const createPoll = async (
  sessionId,
  userId,
  title,
  options,
  checkedAnonymous,
  checkedNotification,
  state = POLLS_STATES.PUBLISHED,
  namespace = POLLS_NAMESPACES.GLOBAL
) => {
  let db = firebase.firestore();

  let pollId = String(new Date().getTime());

  let votesCounter = {};
  _.forEach(options, (o) => (votesCounter[o.id] = 0));

  let pollDb = {
    id: pollId,
    owner: userId,
    creationDate: firebase.firestore.FieldValue.serverTimestamp(),
    title,
    options,
    votesCounter,
    checkedAnonymous,
    checkedNotification,
    state
  };

  await db
    .collection("eventSessions")
    .doc(sessionId.toLowerCase())
    .collection("polls")
    .doc(namespace)
    .collection("polls")
    .doc(pollId)
    .set(pollDb);
};

export const votePoll = (
  userId,
  originalSessionId,
  pollId,
  optionId,
  namespace = POLLS_NAMESPACES.GLOBAL
) => {
  const sessionId = originalSessionId.toLowerCase();
  let db = firebase.firestore();

  let pollRef = db
    .collection("eventSessions")
    .doc(sessionId.toLowerCase())
    .collection("polls")
    .doc(namespace)
    .collection("polls")
    .doc(pollId);

  let userVoteRef = db
    .collection("eventSessions")
    .doc(sessionId.toLowerCase())
    .collection("polls")
    .doc(namespace)
    .collection("userVotes")
    .doc(userId);

  return db
    .runTransaction(async function (transaction) {
      let pollSnapshot = await transaction.get(pollRef);
      if (!pollSnapshot.exists) {
        throw new Error("Poll doesn't exist");
      }

      let poll = pollSnapshot.data();

      let userVoteSnapshot = await transaction.get(userVoteRef);

      let userVote = userVoteSnapshot.data();

      if (userVote && userVote[pollId] && userVote[pollId].voted) {
        throw new Error("User has already voted for this poll");
      }

      let updatePollObj = {};
      updatePollObj[
        `votesCounter.${optionId}`
      ] = firebase.firestore.FieldValue.increment(1);
      transaction.update(pollRef, updatePollObj);

      let updateVoteObj = {
        [pollId]: {
          voted: true,
          votedFor: poll.checkedAnonymous ? null : optionId,
          votedAt: firebase.firestore.FieldValue.serverTimestamp()
        }
      };
      transaction.set(userVoteRef, updateVoteObj, { merge: true });
    })
    .then(function () {
      // console.log("Transaction successfully committed!");
    })
    .catch(function (error) {
      console.log("Transaction failed: ", error);
      // snackbar.showMessage(error.message);
      // throw error;
    });
};

export const setPollState = async (
  sessionId,
  userId,
  pollId,
  newState,
  namespace = POLLS_NAMESPACES.GLOBAL
) => {
  let db = firebase.firestore();

  var batch = db.batch();

  let pollRef = db
    .collection("eventSessions")
    .doc(sessionId.toLowerCase())
    .collection("polls")
    .doc(namespace)
    .collection("polls")
    .doc(pollId);

  batch.set(pollRef, {
    state: newState,
    changedBy: userId,
    changedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  let auditTrailRef = db
    .collection("eventSessions")
    .doc(sessionId.toLowerCase())
    .collection("polls")
    .doc(namespace)
    .collection("auditTrail")
    .doc(String(new Date().getTime()));

  batch.set(auditTrailRef, {
    action: "updateState",
    actionParams: {
      newState
    },
    by: userId,
    at: firebase.firestore.FieldValue.serverTimestamp()
  });

  await batch.commit();
};
