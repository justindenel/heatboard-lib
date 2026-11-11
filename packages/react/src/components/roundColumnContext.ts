import { createContext, useContext } from "react";

/** True under a round column, which already names the round for its heats. */
export const InRoundColumn = createContext(false);

export const useInRoundColumn = () => useContext(InRoundColumn);
