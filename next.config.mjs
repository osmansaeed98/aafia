/** @type {import('next').NextConfig} */
export default {
  experimental: {
    // Prescription photos are shrunk on the phone to well under 1 MB. A
    // larger one (phone couldn't shrink it) still reaches our code, which
    // explains the problem; Vercel's own limit is 4.5 MB.
    serverActions: { bodySizeLimit: "4mb" },
  },
};
