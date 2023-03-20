const Hostel = require("../model/hostelModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const config = require("../utils/config");
const {
  getEmailsOfAHostel,
  getAllEmails,
} = require("../config/googleSheetsSetup");

// const BHRData = require("../data/bhr.json");
// const MHRData = require("../data/mhr.json");
// const SHRData = require("../data/shr.json");
// const RHRData = require("../data/rhr.json");
// const GHRData = require("../data/ghr.json");

const WARDEN_EMAIL = config.WARDEN_EMAIL;
const ADMIN_EMAILS = config.ADMIN_EMAILS;

const checkIfUserBelongsToAHostel = async (hostel, email) => {
  const emails = await getEmailsOfAHostel(hostel);

  return emails.includes(email);
};

const hasVoted = async (hostel, email) => {
  const currHostel = await Hostel.findOne({ hostel: hostel });

  if (currHostel.voted.includes(email)) return true;

  return false;
};

const authCheck = async (hostel, email) => {
  if (!email) {
    console.log("Email not found");
    throw new AppError("No email present", 401);
  }

  if (!hostel || !["BHR", "SHR", "RHR", "MHR", "GHR"].includes(hostel)) {
    throw new AppError("No hostel present", 400);
  }

  const userBelongsToAHostel = await checkIfUserBelongsToAHostel(hostel, email);

  if (!userBelongsToAHostel)
    throw new AppError("User not found in hostel", 404);

  const voted = await hasVoted(hostel, email);

  if (voted) {
    throw new AppError("Voter has voted already", 403);
  }

  return true;
};

const checkEligibility = catchAsync(async (req, res, next) => {
  const { hostel } = req.body;
  const email = req.user.emails[0].value;

  const eligible = await authCheck(hostel, email);

  res.status(200).json({
    message: `User belongs to ${hostel} and has not voted yet, allow voting!`,
  });
});

const registerVote = (post, choice) => {
  if (choice === "NOTA") post.nota = post.nota + 1;
  else if (choice === "AFV") post.abstain = post.abstain + 1;
  else {
    const index = post.contestants.findIndex(
      (contestant) => contestant.email === choice
    );

    if (index < 0) {
      throw new AppError(`Candidate with email ${choice} does not exist`, 400);
    }

    post.contestants[index].votes = post.contestants[index].votes + 1;
  }
};

const vote = catchAsync(async (req, res, next) => {
  const { gsec, msec1, msec2, hsec, hostel } = req.body;
  const email = req.user?.email;

  if (!email) {
    res.status(400).json({
      status: "fail",
      message: "Unable to find email address",
    });
    return;
  }

  if (ADMIN_EMAILS.includes(email)) {
    res.status(200).json({
      status: "success",
      message: "Admin Vote, does not get counted!",
    });
    return;
  }

  const isThereMSec2 = hostel === "BHR" || hostel === "MHR";

  if (!gsec || !msec1 || !hsec || (isThereMSec2 && !msec2))
    return next(
      new AppError("Bad Request, Votes for all posts not present", 400)
    );

  if (isThereMSec2) {
    if (
      msec1.includes("@iitbbs.ac.in") &&
      msec2.includes("@iitbbs.ac.in") &&
      msec1 === msec2
    ) {
      return next(
        new AppError("Same candidate voted for both mess secretary posts.", 400)
      );
    }
  }

  const eligible = await authCheck(hostel, email);

  const currHostel = await Hostel.findOne({ hostel: hostel });

  currHostel.voted.push(email);

  registerVote(currHostel.gsec, gsec);
  registerVote(currHostel.msec1, msec1);
  registerVote(currHostel.hsec, hsec);

  if (isThereMSec2) registerVote(currHostel.msec2, msec2);

  await currHostel.save();

  res.status(200).json({
    status: "success",
    message: "Vote has been successfully registered",
  });
});

const createHostel = catchAsync(async (req, res, next) => {
  const { hostel, voted, gsec, msec1, msec2, hsec } = req.body;

  const newHostel = await Hostel.create({
    hostel,
    voted,
    gsec,
    msec1,
    msec2,
    hsec,
  });

  if (!newHostel)
    return next(new AppError("Something went wrong creating hostel", 500));

  console.log(newHostel);

  res.status(201).json({
    status: "status",
    message: `Hostel ${newHostel.hostel} created successfully`,
  });
});

const refreshEmailsData = catchAsync(async (req, res, next) => {
  await getAllEmails();

  res.status(200).json({
    status: "success",
    message: "Emails refreshed successfully",
  });
});

// const createFreshDB = catchAsync(async (req, res, next) => {
//   const deleted = await Hostel.deleteMany();
//   console.log(deleted);
//   const newHostels = await Hostel.insertMany([
//     BHRData,
//     GHRData,
//     SHRData,
//     MHRData,
//     RHRData,
//   ]);

//   console.log(newHostels);

//   res.status(201).json({
//     status: "success",
//     message: "Added new hostels",
//     newHostels,
//   });
// });

const getResults = catchAsync(async (req, res, next) => {
  const email = req.user?.email;

  if (!email || !ADMIN_EMAILS.includes(email)) {
    return next(new AppError("You are not allowed to access the results", 401));
  }

  const { hostel } = req.body;

  if (!hostel || !["BHR", "SHR", "RHR", "MHR", "GHR"].includes(hostel)) {
    throw new AppError("No hostel present", 400);
  }

  const currHostel = await Hostel.findOne({ hostel: hostel });

  res.status(200).json({
    status: "success",
    message: "Results Fetched successfully",
    hostel: currHostel,
  });
});

module.exports = {
  checkEligibility,
  vote,
  createHostel,
  getResults,
  authCheck,
  refreshEmailsData,
  // createFreshDB,
};
