// Just testing the logic for session management
const checklistId = "123";
const responseSessionKey = `tieck_response_session_${checklistId}`;
const session = { responseId: "a", responseToken: "b", createdAt: Date.now() };

sessionStorage.setItem(responseSessionKey, JSON.stringify(session));

const read = () => {
  const raw = sessionStorage.getItem(responseSessionKey);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  
  // Expiration check (23 hours)
  if (Date.now() - parsed.createdAt > 23 * 60 * 60 * 1000) {
    return null;
  }
  return parsed;
};

console.log("Read session:", read());
