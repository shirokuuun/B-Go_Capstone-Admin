import { collection, getDocs } from "firebase/firestore";
import { db } from "/src/firebase/firebase";

export const fetchSOSRequests = async () => {
  const querySnapshot = await getDocs(collection(db, "sosRequests"));
  const sosList = [];

  querySnapshot.forEach((doc) => {
    sosList.push({
      id: doc.id,
      ...doc.data(),
    });
  });

  return sosList;
};
