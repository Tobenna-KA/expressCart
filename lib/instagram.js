// const { get } = require('lodash');
const fetch = require('node-fetch');

// async function getInstagramPictures(profileName) {
//   const baseUrl = 'https://www.instagram.com';
//   const profileUrl = `${baseUrl}/${profileName}`;
//   const jsonDataUrl = `${profileUrl}/?__a=1`;

//   try {
//     const response = await fetch(jsonDataUrl);
//     const jsonData = await response.json();
//     const pictures = jsonData.graphql.user.edge_owner_to_timeline_media.edges;

//     if (response.ok) {
//       const instafeed = pictures.map((picture) => {
//         return (picture = {
//           ...picture,
//           profileUrl,
//         });
//       });

//       return instafeed;
//     } else {
//       throw new Error(pictures);
//     }
//   } catch (e) {
//     return [];
//   }
// }

function getInstagramPictures(profileName) {
  return new Promise((resolve, reject) => {
    const userInstagram = require('user-instagram');

    // Gets informations about a user
    userInstagram(profileName) // Same as getUserData()
      .then((data) => {
        const instaFeed = {
          fullName: data.fullName,
          biography: data.biography,
          link: data.link,
          profilePicHD: data.profilePicHD,
          mainPosts: data.posts.slice(0, 3),
          bottomCarousel1: data.posts.slice(4, 8),
          bottomCarousel2: data.posts.slice(8, 14),
        };

        instaFeed.mainPosts.map((post) => {
          post.fullName = data.fullName;
          post.link = data.link;
          post.profilePicHD = data.profilePicHD;
        });
<<<<<<< HEAD
      });

      console.log(instafeed)

      return instafeed;
    } else {
      throw new Error(pictures);
    }
  } catch (e) {
    console.log(e)
    return []
  }
=======

        resolve(instaFeed);
      })
      .catch(console.error);
  });
>>>>>>> downy
}

module.exports = getInstagramPictures;
